// @vitest-environment happy-dom

/**
 * The lesson card's dragging: by the header to anywhere on screen, kept on screen, and docked again by ⇆.
 *
 * @see components/app/synth/lesson-card.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LessonCard, stepBadges } from '@/components/app/synth/lesson-card';
import { badgeStore, highlightStore } from '@/components/app/synth/stores';
import { getSynthDef } from '@/lib/app/synths/defs';
import { START_STEP, defaultPatchSound, startStep } from '@/lib/app/synths/default-patch';
import type { Preset } from '@/lib/app/synths/contract';

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
    expect(item?.textContent).toBe(`2UnplugTake out ${out.label} out → ${into.label} in`);
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
    expect(el.textContent).toContain('Set your synth to the Default patch');
    expect(el.textContent).toContain(startStep(def).why);
    // The whole panel is the Default patch: no ①②③, where the finished sound would number its tweaks.
    expect(badgeStore.get()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Previous lesson step' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next lesson step' }));
    expect(onStep).toHaveBeenLastCalledWith(0);
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

  it('is not in the Default patch’s own lesson, which starts at its one step', () => {
    const { onStep } = card(defaultPatchSound(def), null);
    fireEvent.click(screen.getByRole('button', { name: /Build it step by step/ }));
    expect(onStep).toHaveBeenLastCalledWith(0);
    cleanup();
    card(defaultPatchSound(def), 0);
    expect(screen.getByRole('button', { name: 'Previous lesson step' })).toBeDisabled();
  });
});
