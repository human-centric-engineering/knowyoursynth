// @vitest-environment happy-dom

/**
 * The lesson card's dragging: by the header to anywhere on screen, kept on screen, and docked again by ⇆.
 *
 * @see components/app/synth/lesson-card.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LessonCard } from '@/components/app/synth/lesson-card';
import { faceRoles } from '@/components/app/synth/face-roles';
import { INK, PAPER } from '@/components/app/panel/parts';
import { stepBadges } from '@/lib/app/synths/lib/history';
import {
  badgeStore,
  highlightStore,
  lessonAreaStore,
  moveStore,
} from '@/components/app/synth/stores';
import { areaOf } from '@/lib/app/synths/lib/areas';
import { layoutDef } from '@/lib/app/synths/lib/layout';
import { controlMap } from '@/lib/app/synths/lib/patch';
import { getSynthDef } from '@/lib/app/synths/defs';
import { START_STEP, defaultPatchSound, startStep } from '@/lib/app/synths/default-patch';
import type { Preset, SynthDef } from '@/lib/app/synths/contract';

const get = vi.hoisted(() => vi.fn(async () => []));
const post = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiClient: { get, post } }));
// Suggest a link on a library patch (`f-link-suggestions` t-186) asks whether someone is signed in.
vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({ data: { user: { id: 'user-1' } }, isPending: false }),
}));

const found = getSynthDef('model-d');
if (!found) throw new Error('model-d is not registered');
const def = found;

beforeEach(() => {
  window.innerWidth = 1400;
  window.innerHeight = 900;
});

function setup() {
  const onSide = vi.fn();
  render(
    <LessonCard
      def={def}
      preset={null}
      step={null}
      onStep={vi.fn()}
      section="fx"
      onClose={vi.fn()}
      side="right"
      onSide={onSide}
      inspector={null}
      effects={<p>rack</p>}
    />
  );
  const card = screen.getByTestId('lesson-card');
  // happy-dom lays nothing out: the docked card is 400 wide at (960, 300).
  card.getBoundingClientRect = () => new DOMRect(960, 300, 400, 500);
  const head = screen.getByRole('heading', { name: 'Pedals after the synth' }).closest('header');
  if (!head) throw new Error('no header');
  return { card, head, onSide };
}

const drag = (el: Element, from: [number, number], to: [number, number]) => {
  fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: to[0], clientY: to[1] });
};

describe('LessonCard dragging', () => {
  it('moves by the header, keeping the grab point under the pointer', () => {
    const { card, head } = setup();
    expect(card).not.toHaveAttribute('data-detached');

    drag(head, [1000, 320], [300, 120]);

    expect(card).toHaveAttribute('data-detached');
    expect(card.style.left).toBe('260px');
    expect(card.style.top).toBe('100px');
  });

  it('stays on screen when dragged past the edges', () => {
    const { card, head } = setup();

    drag(head, [1000, 320], [5000, 5000]);
    expect(card.style.left).toBe(`${1400 - 400 - 8}px`);
    expect(card.style.top).toBe(`${900 - 120}px`);

    drag(head, [1000, 320], [-5000, -5000]);
    expect(card.style.left).toBe('8px');
    expect(card.style.top).toBe('8px');
  });

  it("goes anywhere on the screen, over the dock, its height down to the screen's foot (t-202)", () => {
    document.documentElement.style.setProperty('--kys-dock-h', '180px');
    try {
      const { card, head } = setup();
      drag(head, [1000, 320], [1000, 5000]);
      expect(card.style.top).toBe(`${900 - 120}px`);
      expect(card.style.maxHeight).toBe(`calc(100vh - ${900 - 120 + 8}px)`);
    } finally {
      document.documentElement.style.removeProperty('--kys-dock-h');
    }
  });

  it('does not drag from the header buttons', () => {
    const { card } = setup();
    drag(screen.getByRole('button', { name: 'Close the card' }), [1300, 320], [300, 120]);
    expect(card).not.toHaveAttribute('data-detached');
  });

  it('docks again on the other side from ⇆', () => {
    const { card, head, onSide } = setup();
    drag(head, [1000, 320], [300, 120]);

    fireEvent.click(screen.getByRole('button', { name: 'Move the card to the left' }));

    expect(onSide).toHaveBeenCalledTimes(1);
    expect(card).not.toHaveAttribute('data-detached');
    expect(card.style.left).toBe('');
  });
});

describe('LessonCard sizing (t-203)', () => {
  const grip = () => screen.getByRole('button', { name: 'Resize the card' });
  const size = (el: Element, from: [number, number], to: [number, number]) => {
    fireEvent.pointerDown(el, { pointerId: 2, button: 0, clientX: from[0], clientY: from[1] });
    fireEvent.pointerMove(el, { pointerId: 2, clientX: to[0], clientY: to[1] });
    fireEvent.pointerUp(el, { pointerId: 2, clientX: to[0], clientY: to[1] });
  };

  it('sizes from the grip, lifting a docked card out where it is so its top stays put', () => {
    const { card } = setup();
    size(grip(), [1355, 795], [1305, 745]);
    expect(card).toHaveAttribute('data-detached');
    expect(card.style.left).toBe('960px');
    expect(card.style.top).toBe('300px');
    expect(card.style.width).toBe('350px');
    expect(card.style.height).toBe('450px');
  });

  it('goes no smaller than the least size, and no further than the screen', () => {
    const { card } = setup();
    size(grip(), [1355, 795], [0, 0]);
    expect(card.style.width).toBe('280px');
    expect(card.style.height).toBe('180px');
    size(grip(), [1355, 795], [5000, 5000]);
    expect(card.style.width).toBe(`${1400 - 960 - 8}px`);
    expect(card.style.height).toBe(`${900 - 300 - 8}px`);
  });

  it('sizes by the arrow keys, four times as far with Shift', () => {
    const { card } = setup();
    fireEvent.keyDown(grip(), { key: 'ArrowLeft' });
    expect(card.style.width).toBe('384px');
    expect(card.style.height).toBe('500px');
    fireEvent.keyDown(grip(), { key: 'ArrowUp', shiftKey: true });
    expect(card.style.height).toBe('436px');
    fireEvent.keyDown(grip(), { key: 'Enter' });
    expect(card.style.height).toBe('436px');
  });

  it('moves rather than narrows when the window shrinks, if it still fits', () => {
    const { card } = setup();
    size(grip(), [1355, 795], [1355, 795]);
    expect(card.style.width).toBe('400px');
    // The window narrows to 1200: the card, 400 wide at x 960, has to move left to stay on screen, and keeps its width.
    card.getBoundingClientRect = () => new DOMRect(960, 300, 400, 500);
    Object.defineProperty(card, 'offsetWidth', { configurable: true, value: 400 });
    window.innerWidth = 1200;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(card.style.width).toBe('400px');
    expect(card.style.left).toBe(`${1200 - 400 - 8}px`);
  });

  it('keeps its size when docked again by ⇆', () => {
    const { card } = setup();
    size(grip(), [1355, 795], [1305, 745]);
    fireEvent.click(screen.getByRole('button', { name: 'Move the card to the left' }));
    expect(card).not.toHaveAttribute('data-detached');
    expect(card.style.width).toBe('350px');
  });
});

describe('stepBadges', () => {
  it('numbers each control or jack once, though two cables share an input', () => {
    const step = {
      title: 'Patch it',
      module: 'mixer' as const,
      why: '',
      set: { 'mix.osc1': 9 },
      cables: [
        ['osc1.out', 'vcf.in'],
        ['osc2.out', 'vcf.in'],
        ['lfo.out', 'vca.cv'],
      ] as [string, string][],
    };
    expect(stepBadges(step)).toEqual(['mix.osc1', 'vcf.in', 'vca.cv']);
  });

  it('numbers a cable taken out after the controls and before the cables plugged in', () => {
    const step = {
      title: 'Move it',
      module: 'patch' as const,
      why: '',
      set: { 'mix.osc1': 9 },
      cables: [['lfo.out', 'vca.cv']] as [string, string][],
      unplug: [['osc1.out', 'vcf.in']] as [string, string][],
    };
    expect(stepBadges(step)).toEqual(['mix.osc1', 'vcf.in', 'vca.cv']);
  });
});

describe('LessonCard unplug', () => {
  const out = def.jacks.find((j) => j.dir === 'out' && j.signal);
  const into = def.jacks.find((j) => j.dir === 'in' && j.dest);
  if (!out || !into) throw new Error('model-d has no patchable jacks');

  afterEach(() => {
    act(() => {
      badgeStore.set([]);
      highlightStore.set([]);
    });
  });

  it('lists a cable the step takes out as a numbered move, lit on its jacks', () => {
    const sound: Preset = {
      ...defaultPatchSound(def),
      id: 'unplugged',
      name: 'Unplugged',
      steps: [
        { title: 'Plug it', module: 'patch', why: 'In.', cables: [[out.id, into.id]] },
        {
          title: 'Take it out',
          module: 'patch',
          why: 'Out.',
          set: { 'mix.osc1': 9 },
          unplug: [[out.id, into.id]],
        },
      ],
    };
    render(
      <LessonCard
        def={def}
        preset={sound}
        step={1}
        onStep={vi.fn()}
        section="build"
        onClose={vi.fn()}
        side="right"
        onSide={vi.fn()}
        inspector={null}
        effects={null}
      />
    );

    const moves = screen.getByRole('list', { name: 'What this step sets' });
    const item = [...moves.querySelectorAll('li')].find((li) => li.textContent?.includes('Unplug'));
    expect(item?.textContent).toBe(`2Unplug${out.label} out → ${into.label} in`);
    // The panel numbers its input jack as the card does, and pointing at the move lights both of its ends.
    expect(badgeStore.get()).toEqual(['mix.osc1', into.id]);
    const move = item?.querySelector('.kys-card-move');
    if (!move) throw new Error('no move');
    fireEvent.pointerEnter(move);
    expect(highlightStore.get()).toEqual([out.id, into.id]);
    fireEvent.pointerLeave(move);
    expect(highlightStore.get()).toEqual(['mix.osc1', out.id, into.id]);
  });
});

describe('LessonCard live region', () => {
  const card = (section: 'build' | 'inspector' | 'fx') =>
    render(
      <LessonCard
        def={def}
        preset={null}
        step={null}
        onStep={vi.fn()}
        section={section}
        onClose={vi.fn()}
        side="right"
        onSide={vi.fn()}
        inspector={<p>inspector</p>}
        effects={<p>rack</p>}
      />
    );

  it("hangs the lesson from a strip of the face, its body the stage's, and not the inspector or the effects (t-201)", () => {
    const face = faceRoles(PAPER, PAPER, INK);
    const head = () => screen.getByTestId('lesson-card').querySelector('header');
    const view = (section: 'build' | 'inspector' | 'fx') =>
      render(
        <LessonCard
          def={def}
          preset={null}
          step={null}
          onStep={vi.fn()}
          section={section}
          onClose={vi.fn()}
          side="right"
          onSide={vi.fn()}
          inspector={<p>inspector</p>}
          effects={<p>rack</p>}
          face={face}
        />
      );
    const { unmount } = view('build');
    expect(head()).toHaveClass('kys-face');
    expect(head()?.style.getPropertyValue('--kys-text')).toBe(INK);
    expect(screen.getByTestId('lesson-card').style.getPropertyValue('--kys-text')).toBe('');
    // Set in a bezel, so the header lifts off a panel of its own colour.
    expect(screen.getByTestId('lesson-card')).toHaveClass('is-faced');
    unmount();
    for (const section of ['inspector', 'fx'] as const) {
      const v = view(section);
      expect(head()).not.toHaveClass('kys-face');
      expect(head()?.style.getPropertyValue('--kys-text')).toBe('');
      expect(screen.getByTestId('lesson-card')).not.toHaveClass('is-faced');
      v.unmount();
    }
  });

  it('announces the lesson as it moves on, and not the inspector or the effects', () => {
    const body = () => screen.getByTestId('lesson-card').querySelector('.kys-card-body');
    const { unmount } = card('build');
    expect(body()).toHaveAttribute('aria-live', 'polite');
    unmount();
    for (const section of ['inspector', 'fx'] as const) {
      const view = card(section);
      expect(body()).not.toHaveAttribute('aria-live');
      view.unmount();
    }
  });
});

describe('LessonCard step 0', () => {
  const sound: Preset = {
    ...defaultPatchSound(def),
    id: 'two-steps',
    name: 'Two steps',
    steps: [
      { title: 'Open the mixer', module: 'mixer', why: 'Loud.', set: { 'mix.osc1': 9 } },
      {
        title: 'Close the filter',
        module: 'filter',
        why: 'Dark.',
        set: { 'filter.cutoff': -2 },
      },
    ],
    tweaks: [{ id: 'filter.cutoff', try: 'Open it', hear: 'Brighter.' }],
  };
  const card = (preset: Preset, step: number | null) => {
    const onStep = vi.fn();
    render(
      <LessonCard
        def={def}
        preset={preset}
        step={step}
        onStep={onStep}
        section="build"
        onClose={vi.fn()}
        side="right"
        onSide={vi.fn()}
        inspector={null}
        effects={null}
      />
    );
    return { onStep, el: screen.getByTestId('lesson-card') };
  };

  afterEach(() => {
    act(() => {
      badgeStore.set([]);
      highlightStore.set([]);
    });
  });

  it('asks for the Default patch on the user’s synth, numbers no moves, and Next goes to step 1', () => {
    const { onStep, el } = card(sound, START_STEP);
    expect(el.textContent).toMatch(/Step 0 of 2 · Start/);
    expect(el.textContent).toContain('Set your synth to the Default Saw');
    expect(el.textContent).toContain(startStep(def).why);
    // The whole panel is the Default patch: no ①②③, where the finished sound would number its tweaks.
    expect(badgeStore.get()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Previous lesson step' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next lesson step' }));
    expect(onStep).toHaveBeenLastCalledWith(0, 'next');
  });

  it('is where Build it step by step and Previous from step 1 go', () => {
    const { onStep } = card(sound, null);
    fireEvent.click(screen.getByRole('button', { name: /Build it step by step/ }));
    expect(onStep).toHaveBeenLastCalledWith(START_STEP);
    cleanup();
    const at1 = card(sound, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Previous lesson step' }));
    expect(at1.onStep).toHaveBeenLastCalledWith(START_STEP);
  });

  it('offers Replay changes on each step after step 0, and rings the number of the move being made', () => {
    const { onStep } = card(sound, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Replay changes' }));
    expect(onStep).toHaveBeenLastCalledWith(1, 'replay');
    const num = () => screen.getByText('Close the filter', { selector: 'h2' }).closest('aside');
    expect(num()?.querySelector('.kys-card-num[data-now]')).toBeNull();
    act(() => moveStore.set({ id: 'filter.cutoff', ids: ['filter.cutoff'] }));
    expect(num()?.querySelector('.kys-card-num[data-now]')?.textContent).toBe('1');
    act(() => moveStore.set(null));
    cleanup();
    // Step 1 replays from step 0, the Default patch; the Default patch's own lesson has no step before its one.
    card(sound, 0);
    expect(screen.getByRole('button', { name: 'Replay changes' })).toBeTruthy();
    cleanup();
    card(defaultPatchSound(def), 0);
    expect(screen.queryByRole('button', { name: 'Replay changes' })).toBeNull();
  });

  it('is not in the Default patch’s own lesson, which starts at its one step', () => {
    const { onStep } = card(defaultPatchSound(def), null);
    fireEvent.click(screen.getByRole('button', { name: /Build it step by step/ }));
    expect(onStep).toHaveBeenLastCalledWith(0);
    cleanup();
    card(defaultPatchSound(def), 0);
    expect(screen.getByRole('button', { name: 'Previous lesson step' })).toBeDisabled();
  });
});

describe('LessonCard videos and links', () => {
  const sound = (): Preset => ({ ...defaultPatchSound(def), id: 'autobahn-lead' });
  const card = (
    links?: { count: number; kinds: ('lesson' | 'original')[] },
    librarySound = false
  ) =>
    render(
      <LessonCard
        def={def}
        preset={sound()}
        step={null}
        onStep={vi.fn()}
        section="build"
        onClose={vi.fn()}
        side="right"
        onSide={vi.fn()}
        inspector={null}
        effects={null}
        links={links}
        suggestLink={
          librarySound
            ? [{ kind: 'sound', id: 'model-d/autobahn-lead', name: sound().name }]
            : undefined
        }
      />
    );

  it("offers a library patch's videos and links on its overview, read for that patch when pressed", async () => {
    card({ count: 2, kinds: ['lesson', 'original'] });
    const button = screen.getByRole('button', { name: /Videos and links/ });
    expect(button.textContent).toContain('lessons and originals');

    fireEvent.click(button);

    await screen.findByText('There are none to show now.');
    expect(get).toHaveBeenCalledWith('/api/v1/links', {
      params: { sound: 'model-d/autobahn-lead' },
    });
  });

  it('offers none without links', () => {
    card();
    expect(screen.queryByRole('button', { name: /Videos and links/ })).toBeNull();
  });

  it('lets a library patch with no links be suggested one, for that patch', async () => {
    post.mockResolvedValue({ id: 'lsug-1' });
    card(undefined, true);
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a link' }));
    expect(
      screen.getByRole('heading', { name: `Suggest a link for ${sound().name}` })
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Address/, { selector: 'input' }), {
      target: { value: 'https://vimeo.com/123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }));

    await screen.findByRole('status');
    expect(post).toHaveBeenCalledWith('/api/v1/links/suggestions', {
      body: {
        target: { kind: 'sound', id: 'model-d/autobahn-lead' },
        url: 'https://vimeo.com/123456',
        kind: 'demo',
      },
    });
  });

  it('offers a suggestion under the cards of a library patch with links', async () => {
    card({ count: 2, kinds: ['lesson', 'original'] }, true);
    expect(screen.queryByRole('button', { name: 'Suggest a link' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Videos and links/ }));
    await screen.findByText('There are none to show now.');
    expect(screen.getByRole('button', { name: 'Suggest a link' })).toBeTruthy();
  });

  it('offers no suggestion for a sound that is not a library patch', () => {
    card();
    expect(screen.queryByRole('button', { name: 'Suggest a link' })).toBeNull();
  });
});

describe("LessonCard beside the step's sections (t-297)", () => {
  const ids = ['mix.osc1', 'filter.cutoff'];
  const sound = (d: SynthDef, set: Record<string, number>): Preset => ({
    ...defaultPatchSound(d),
    id: 'beside',
    name: 'Beside',
    steps: [{ title: 'Set it', module: 'mixer', why: 'Why.', set }],
  });
  const areasOf = (d: SynthDef, of: string[]) => {
    const cm = controlMap(d);
    return [
      ...new Set(
        of.map((id) => {
          const c = cm[id];
          if (!c) throw new Error(`${d.id} has no ${id}`);
          const a = areaOf(d, c);
          if (!a) throw new Error(`${id} is in no area`);
          return a.id;
        })
      ),
    ];
  };

  // The panel's lit sections, as `LessonAreaLayer` draws them, at the given screen spans (happy-dom lays nothing out).
  let drawn: HTMLElement[] = [];
  const panelAt = (...spans: [number, number][]) => {
    const made = spans.map(([left, right]) => {
      const el = document.createElement('div');
      el.setAttribute('data-lesson-area', 'x');
      el.getBoundingClientRect = () => new DOMRect(left, 200, right - left, 300);
      document.body.appendChild(el);
      return el;
    });
    drawn.push(...made);
    return made;
  };

  // What each ResizeObserver watches, and a way to fire it: happy-dom lays nothing out, so nothing resizes on its own.
  let observed: { els: Element[]; fire: () => void }[] = [];
  beforeEach(() => {
    observed = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        els: Element[] = [];
        constructor(cb: () => void) {
          observed.push({ els: this.els, fire: cb });
        }
        observe(el: Element) {
          this.els.push(el);
        }
        unobserve() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    drawn.forEach((el) => el.remove());
    drawn = [];
    cleanup();
    act(() => lessonAreaStore.set([]));
  });

  function open(
    props: { d?: SynthDef; set?: Record<string, number>; section?: 'build' | 'fx' } = {}
  ) {
    const d = props.d ?? def;
    const onSide = vi.fn();
    const view = render(
      <LessonCard
        def={d}
        preset={sound(d, props.set ?? Object.fromEntries(ids.map((id) => [id, 5])))}
        step={0}
        onStep={vi.fn()}
        section={props.section ?? 'build'}
        onClose={vi.fn()}
        side="right"
        onSide={onSide}
        inspector={null}
        effects={null}
      />
    );
    const card = screen.getByTestId('lesson-card');
    Object.defineProperty(card, 'offsetWidth', { configurable: true, value: 400 });
    // Docked at the height the sections are drawn at (happy-dom lays nothing out), so they are level with it.
    card.getBoundingClientRect = () => new DOMRect(960, 300, 400, 500);
    return { card, onSide, view };
  }

  it("lights the sections the step's moves are in, and lets them go when the card closes", () => {
    const { view } = open();
    const expected = areasOf(def, ids);
    expect(expected.length).toBe(2);
    expect(lessonAreaStore.get()).toEqual(expected);

    view.unmount();
    expect(lessonAreaStore.get()).toEqual([]);
  });

  it('stands beside the sections on the side with more room', async () => {
    panelAt([100, 300], [250, 500]);
    const { card } = open();
    await waitFor(() => expect(card.style.left).toBe(`${500 + 16}px`));
    expect(card).toHaveAttribute('data-beside');
    expect(card).not.toHaveAttribute('data-detached');
  });

  it('stands to their left when the room is that side', async () => {
    panelAt([900, 1300]);
    const { card } = open();
    await waitFor(() => expect(card.style.left).toBe(`${900 - 16 - 400}px`));
  });

  it('keeps to the far edge when it fits beside them on neither side', async () => {
    panelAt([200, 1200]);
    const { card } = open();
    await waitFor(() => expect(card.style.left).toBe(`${1400 - 400 - 16}px`));
  });

  it('docks from ⇆ on the side away from the sections, and stays docked', async () => {
    panelAt([900, 1300]);
    const { card, onSide } = open();
    await waitFor(() => expect(card.style.left).toBe('484px'));

    fireEvent.click(screen.getByRole('button', { name: 'Move the card to the left' }));

    expect(onSide).toHaveBeenCalledTimes(1);
    expect(card).not.toHaveAttribute('data-beside');
    expect(card.style.left).toBe('');
  });

  it('docks on its own side with ⇆ when the sections are on the other half', async () => {
    // The card stands just right of the screen's middle, but the sections are on the left half: it docks right.
    panelAt([100, 500]);
    const { card, onSide } = open();
    await waitFor(() => expect(card.style.left).toBe('516px'));

    fireEvent.click(screen.getByRole('button', { name: 'Move the card to the right' }));

    expect(onSide).not.toHaveBeenCalled();
    expect(card).not.toHaveAttribute('data-beside');
  });

  it('stands beside nothing while the panel is turned away for the routing view', async () => {
    const away = document.createElement('div');
    away.className = 'kys-panel-scroller is-away';
    document.body.appendChild(away);
    drawn.push(away);
    const [area] = panelAt([100, 500]);
    away.appendChild(area);
    const { card } = open();
    await new Promise((r) => requestAnimationFrame(r));
    expect(card).not.toHaveAttribute('data-beside');
  });

  it("does not re-measure for a scroll of the card's own text", async () => {
    const [area] = panelAt([100, 500]);
    const { card } = open();
    await waitFor(() => expect(card.style.left).toBe('516px'));

    area.getBoundingClientRect = () => new DOMRect(200, 200, 400, 300);
    const body = card.querySelector('.kys-card-body');
    if (!body) throw new Error('no card body');
    fireEvent.scroll(body);
    await new Promise((r) => requestAnimationFrame(r));
    expect(card.style.left).toBe('516px');

    fireEvent.scroll(window);
    await waitFor(() => expect(card.style.left).toBe('616px'));
  });

  it('follows the sections when the window or the panel changes size', async () => {
    const frame = document.createElement('div');
    frame.setAttribute('data-testid', 'panel-frame');
    document.body.appendChild(frame);
    drawn.push(frame);
    const [area] = panelAt([100, 500]);
    const { card } = open();
    await waitFor(() => expect(card.style.left).toBe('516px'));

    area.getBoundingClientRect = () => new DOMRect(200, 200, 400, 300);
    fireEvent(window, new Event('resize'));
    await waitFor(() => expect(card.style.left).toBe('616px'));
  });

  it('keeps on screen when the sections are scrolled off it', async () => {
    panelAt([-900, -500]);
    const { card } = open();
    await waitFor(() => expect(card.style.left).toBe('8px'));
  });

  it('docks as before when no sections are drawn, or the step moves nothing on the panel', async () => {
    const { card } = open();
    await new Promise((r) => requestAnimationFrame(r));
    expect(card).not.toHaveAttribute('data-beside');
    expect(card.style.left).toBe('');
    cleanup();

    open({ set: { 'not.a.control': 1 } });
    expect(lessonAreaStore.get()).toEqual([]);
  });

  it('stays where it is dragged to', async () => {
    panelAt([100, 500]);
    const { card } = open();
    await waitFor(() => expect(card.style.left).toBe('516px'));
    card.getBoundingClientRect = () => new DOMRect(516, 300, 400, 500);
    const head = card.querySelector('header');
    if (!head) throw new Error('no header');

    drag(head, [600, 320], [300, 120]);

    expect(card).toHaveAttribute('data-detached');
    expect(card).not.toHaveAttribute('data-beside');
    expect(card.style.left).toBe('216px');
    // The sections stay lit; the card just no longer stands beside them.
    expect(lessonAreaStore.get()).toEqual(areasOf(def, ids));
  });

  it('lights nothing for the effects', () => {
    open({ section: 'fx' });
    expect(lessonAreaStore.get()).toEqual([]);
  });

  it('lights the sections and stands beside them on every synth, not just the Model D (t-298)', async () => {
    // The Grandmother as the page draws it: its compact layout, sections moved and split.
    const long = getSynthDef('grandmother');
    if (!long) throw new Error('grandmother is not registered');
    const other = layoutDef(long);
    expect(other).not.toBe(long);
    const c = other.controls.find((x) => areaOf(other, x));
    if (!c) throw new Error('grandmother has no control in an area');
    panelAt([100, 500]);
    const { card } = open({ d: other, set: { [c.id]: 5 } });
    expect(lessonAreaStore.get()).toEqual(areasOf(other, [c.id]));
    await waitFor(() => expect(card.style.left).toBe('516px'));
    expect(card).toHaveAttribute('data-beside');
  });

  it("lights every section a patchbay step's cables run between, and keeps to the far edge when they span the panel", async () => {
    const d = getSynthDef('system-55');
    if (!d) throw new Error('system-55 is not registered');
    // An output and an input in different sections of the case: the cable crosses the panel.
    const from = d.jacks.find((j) => j.dir === 'out' && areaOf(d, j));
    const fromArea = from && areaOf(d, from);
    const into = d.jacks.find(
      (j) => j.dir === 'in' && areaOf(d, j) && areaOf(d, j)?.id !== fromArea?.id
    );
    if (!from || !fromArea || !into) throw new Error('system-55 has no cable across two sections');
    const intoArea = areaOf(d, into);
    if (!intoArea) throw new Error('no area');

    const patched: Preset = {
      ...defaultPatchSound(d),
      id: 'across',
      name: 'Across',
      steps: [{ title: 'Patch it', module: 'mixer', why: 'Why.', cables: [[from.id, into.id]] }],
    };
    // The two sections as drawn, far apart: no room for the card either side of them, and more to the right.
    panelAt([40, 300], [1000, 1300]);
    render(
      <LessonCard
        def={d}
        preset={patched}
        step={0}
        onStep={vi.fn()}
        section="build"
        onClose={vi.fn()}
        side="right"
        onSide={vi.fn()}
        inspector={null}
        effects={null}
      />
    );
    const card = screen.getByTestId('lesson-card');
    Object.defineProperty(card, 'offsetWidth', { configurable: true, value: 400 });
    card.getBoundingClientRect = () => new DOMRect(960, 300, 400, 500);

    expect([...lessonAreaStore.get()].sort()).toEqual([fromArea.id, intoArea.id].sort());
    await waitFor(() => expect(card.style.left).toBe(`${1400 - 400 - 16}px`));
  });

  it("stands beside the pieces in its own height, not a section's piece in another row", async () => {
    // A modular layout puts a section's pieces in different rows: one in the card's height at the left, one in the row
    // above it at the right, which would leave no room either side if both counted.
    const [inRow, above] = panelAt([100, 500], [900, 1300]);
    inRow.getBoundingClientRect = () => new DOMRect(100, 400, 400, 200);
    above.getBoundingClientRect = () => new DOMRect(900, 50, 400, 200);
    const { card } = open();
    await waitFor(() => expect(card.style.left).toBe('516px'));
  });

  it('docks when none of the lit pieces are level with it, and moves beside them once it grows into their row', async () => {
    const [area] = panelAt([100, 500]);
    area.getBoundingClientRect = () => new DOMRect(100, 50, 400, 200);
    const { card } = open();
    await new Promise((r) => requestAnimationFrame(r));
    expect(card).not.toHaveAttribute('data-beside');
    expect(card.style.left).toBe('');

    // A longer step's text grows the docked card up into the row above: the card's own size is watched.
    card.getBoundingClientRect = () => new DOMRect(960, 100, 400, 700);
    const watched = observed.find((o) => o.els.includes(card));
    if (!watched) throw new Error('the card is not watched for its size');
    act(() => watched.fire());
    await waitFor(() => expect(card.style.left).toBe('516px'));
  });

  it('moves beside them when the Sound Design drawer lifts it into their row, unresized', async () => {
    const page = document.createElement('div');
    page.className = 'kys-synth';
    document.body.appendChild(page);
    drawn.push(page);
    const [area] = panelAt([100, 500]);
    area.getBoundingClientRect = () => new DOMRect(100, 50, 400, 200);
    const d = def;
    render(
      <LessonCard
        def={d}
        preset={sound(d, Object.fromEntries(ids.map((id) => [id, 5])))}
        step={0}
        onStep={vi.fn()}
        section="build"
        onClose={vi.fn()}
        side="right"
        onSide={vi.fn()}
        inspector={null}
        effects={null}
      />,
      { container: page }
    );
    const card = screen.getByTestId('lesson-card');
    Object.defineProperty(card, 'offsetWidth', { configurable: true, value: 400 });
    card.getBoundingClientRect = () => new DOMRect(960, 300, 400, 500);
    await new Promise((r) => requestAnimationFrame(r));
    expect(card).not.toHaveAttribute('data-beside');

    // The page writes the drawer's height on its root, and the card, standing on it, rises into the row above.
    card.getBoundingClientRect = () => new DOMRect(960, 100, 400, 500);
    page.style.setProperty('--kys-strip-h', '200px');
    await waitFor(() => expect(card.style.left).toBe('516px'));
  });
});
