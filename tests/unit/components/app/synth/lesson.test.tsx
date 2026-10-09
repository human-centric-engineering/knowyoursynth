// @vitest-environment happy-dom

/**
 * The lesson, over real Model D sounds as the read layer serves them. The page owns the panel, so these check what the
 * lesson asks of it (`onStep`) and what it points at (`highlightStore`, `focusStore`).
 *
 * @see components/app/synth/lesson.tsx
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Lesson, stepIds } from '@/components/app/synth/lesson';
import { focusStore, highlightStore } from '@/components/app/synth/stores';
import { getSynthDetail } from '@/lib/app/catalogue/read';
import type { CatalogueSound } from '@/lib/app/catalogue/read';
import { getSynthDef } from '@/lib/app/synths/defs';
import { controlMap, displayName, formatValue } from '@/lib/app/synths/lib/patch';
import { modelDRows } from '@/tests/helpers/model-d-detail';

vi.mock('@/lib/db/client', () => ({
  prisma: { synth: { findFirst: vi.fn() }, synthNote: { findMany: vi.fn() } },
}));

const found = getSynthDef('model-d');
if (!found) throw new Error('model-d is not registered');
const def = found;

/** A sound with cables in its steps and tweaks to try: the lesson's every part has something to show. */
let sound: CatalogueSound;

beforeAll(async () => {
  const { prisma } = await import('@/lib/db/client');
  const { stored, noteRows } = modelDRows();
  vi.mocked(prisma.synth.findFirst).mockResolvedValue(stored as never);
  vi.mocked(prisma.synthNote.findMany).mockResolvedValue(noteRows as never);
  const detail = await getSynthDetail('model-d');
  const pick = detail?.sounds.find(
    (s) => s.steps.length > 2 && s.tweaks.length > 0 && s.steps.some((st) => st.cables?.length)
  );
  if (!pick) throw new Error('no Model D sound with cables and tweaks');
  sound = pick;
});

afterEach(() => {
  act(() => {
    highlightStore.set([]);
    focusStore.set(null);
  });
});

function setup(step: number | null = null) {
  const onStep = vi.fn();
  const utils = render(<Lesson def={def} preset={sound} step={step} onStep={onStep} />);
  return { ...utils, onStep };
}

const tab = (name: RegExp) => screen.getByRole('tab', { name });
/** The walkthrough's own button, not the step bar's arrow, which is also labelled "Next step" (as in the prototype). */
const headerButton = (text: string) => {
  const b = screen.getAllByRole('button').find((el) => el.textContent === text);
  if (!b) throw new Error(`no ${text} button`);
  return b;
};
const panel = () => screen.getByRole('tabpanel');
/** The step card in view: the others are hidden from the accessibility tree. */
const visibleStep = () => {
  const cards = panel().querySelectorAll('ol > li[aria-hidden="false"]');
  expect(cards).toHaveLength(1);
  return cards[0] as HTMLElement;
};

describe('Lesson header and overview', () => {
  it('names the sound, its category, reference and blurb, and opens on How it works', () => {
    setup();
    expect(screen.getByRole('heading', { level: 2, name: sound.name })).toBeTruthy();
    expect(screen.getByText(sound.tags[0])).toBeTruthy();
    expect(screen.getByText(sound.ref)).toBeTruthy();
    expect(screen.getByText(sound.blurb)).toBeTruthy();
    expect(tab(/How it works/).getAttribute('aria-selected')).toBe('true');
    expect(within(panel()).getByText(sound.how)).toBeTruthy();
  });

  it('shows the modules the sound uses, in the order its steps first reach them', () => {
    setup();
    const chain = within(panel()).getByLabelText('Parts of the synth this sound uses, in order');
    const firstSeen = [...new Set(sound.steps.map((s) => s.module))];
    expect(chain.querySelectorAll('.rounded-full')).toHaveLength(firstSeen.length);
  });

  it('starts the walkthrough at step 1 from "Build it step by step"', () => {
    const { onStep } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Build it step by step' }));
    expect(onStep).toHaveBeenCalledWith(0);
  });

  it('counts the steps and tweaks on their tabs', () => {
    setup();
    expect(tab(/Build it/).textContent).toContain(`${sound.steps.length} steps`);
    expect(tab(/Make it yours/).textContent).toContain(String(sound.tweaks.length));
  });

  it('moves between tabs with the arrow keys, Home and End', () => {
    setup();
    fireEvent.keyDown(tab(/How it works/), { key: 'ArrowRight' });
    expect(tab(/Build it/).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab(/Build it/), { key: 'End' });
    expect(tab(/Make it yours/).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab(/Make it yours/), { key: 'ArrowRight' });
    expect(tab(/How it works/).getAttribute('aria-selected')).toBe('true');
  });

  it('has no Make it yours tab for a sound with no tweaks', () => {
    render(<Lesson def={def} preset={{ ...sound, tweaks: [] }} step={null} onStep={vi.fn()} />);
    expect(screen.queryByRole('tab', { name: /Make it yours/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ways to make it yours' })).toBeNull();
  });
});

describe('Lesson walkthrough', () => {
  it('jumps to Build it when a walkthrough starts, and badges the step', () => {
    const { rerender, onStep } = setup();
    rerender(<Lesson def={def} preset={sound} step={0} onStep={onStep} />);
    expect(tab(/Build it/).getAttribute('aria-selected')).toBe('true');
    expect(tab(/Build it/).textContent).toContain(`1/${sound.steps.length}`);
  });

  it('highlights what the current step touches, and clears it when the lesson goes', () => {
    const { unmount } = setup(1);
    expect(highlightStore.get()).toEqual(stepIds(sound.steps[1]));
    expect(highlightStore.get().length).toBeGreaterThan(0);
    unmount();
    expect(highlightStore.get()).toEqual([]);
  });

  it('shows the current step’s title, text and the values it sets', () => {
    setup(1);
    const s = sound.steps[1];
    const card = visibleStep();
    expect(within(card).getByText(s.title)).toBeTruthy();
    const [id, v] = Object.entries(s.set ?? {})[0];
    const c = controlMap(def)[id];
    if (!c) throw new Error(`no control ${id}`);
    const chip = within(card).getByText(displayName(def, c)).closest('button');
    expect(chip?.textContent).toContain(formatValue(c, v));
  });

  it('asks for the next and previous step, and Finish on the last', () => {
    const n = sound.steps.length;
    const { onStep, rerender } = setup(1);
    fireEvent.click(headerButton('Next step'));
    expect(onStep).toHaveBeenLastCalledWith(2);
    fireEvent.click(headerButton('Back'));
    expect(onStep).toHaveBeenLastCalledWith(0);
    rerender(<Lesson def={def} preset={sound} step={n - 1} onStep={onStep} />);
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onStep).toHaveBeenLastCalledWith(null);
  });

  it('moves the walkthrough from the numbered step bar', () => {
    const { onStep } = setup(0);
    fireEvent.click(screen.getByRole('button', { name: `Step 3: ${sound.steps[2].title}` }));
    expect(onStep).toHaveBeenLastCalledWith(2);
  });

  it('browses steps without moving the panel when not walking through', () => {
    const { onStep } = setup(null);
    fireEvent.click(tab(/Build it/));
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(onStep).not.toHaveBeenCalled();
    expect(within(visibleStep()).getByText(sound.steps[1].title)).toBeTruthy();
  });

  it('explains a cable in the inspector from its chip', () => {
    const at = sound.steps.findIndex((s) => s.cables?.length);
    setup(at);
    const pair = sound.steps[at].cables?.[0];
    if (!pair) throw new Error('no cable');
    fireEvent.click(within(visibleStep()).getAllByTitle('Explain this cable in the inspector')[0]);
    expect(focusStore.get()).toMatchObject({
      kind: 'cable',
      id: pair.join('>'),
      from: pair[0],
      to: pair[1],
    });
  });
});

describe('Lesson pointing at the panel', () => {
  it('rings a value chip’s control on hover and focus, back to the step on leave, and opens it on click', () => {
    setup(1);
    const base = stepIds(sound.steps[1]);
    const [id] = Object.keys(sound.steps[1].set ?? {});
    const c = controlMap(def)[id];
    if (!c) throw new Error(`no control ${id}`);
    const chip = within(visibleStep()).getByText(displayName(def, c)).closest('button');
    if (!chip) throw new Error('no chip');
    fireEvent.pointerEnter(chip);
    expect(highlightStore.get()).toEqual([id]);
    fireEvent.pointerLeave(chip);
    expect(highlightStore.get()).toEqual(base);
    fireEvent.focus(chip);
    expect(highlightStore.get()).toEqual([id]);
    fireEvent.blur(chip);
    expect(highlightStore.get()).toEqual(base);
    fireEvent.click(chip);
    expect(focusStore.get()).toMatchObject({ kind: 'control', id });
  });

  it('rings both ends of a cable on hover and focus, back to the step on leave', () => {
    const at = sound.steps.findIndex((s) => s.cables?.length);
    setup(at);
    const base = stepIds(sound.steps[at]);
    const pair = sound.steps[at].cables?.[0];
    if (!pair) throw new Error('no cable');
    const chip = within(visibleStep()).getAllByTitle('Explain this cable in the inspector')[0];
    fireEvent.pointerEnter(chip);
    expect(highlightStore.get()).toEqual(pair);
    fireEvent.pointerLeave(chip);
    expect(highlightStore.get()).toEqual(base);
    fireEvent.focus(chip);
    expect(highlightStore.get()).toEqual(pair);
    fireEvent.blur(chip);
    expect(highlightStore.get()).toEqual(base);
  });

  it('lights a step card’s controls on hover while browsing, but not during a walkthrough', () => {
    const { onStep, unmount } = setup(null);
    fireEvent.click(tab(/Build it/));
    const card = visibleStep().firstElementChild;
    if (!card) throw new Error('no card');
    fireEvent.pointerEnter(card);
    expect(highlightStore.get()).toEqual(stepIds(sound.steps[0]));
    fireEvent.pointerLeave(card);
    expect(highlightStore.get()).toEqual([]);
    fireEvent.click(within(visibleStep()).getByTitle('Set the panel to this step'));
    expect(onStep).toHaveBeenLastCalledWith(0);
    unmount();

    setup(1);
    const walkingCard = visibleStep().firstElementChild;
    if (!walkingCard) throw new Error('no card');
    fireEvent.pointerEnter(walkingCard);
    fireEvent.pointerLeave(walkingCard);
    expect(highlightStore.get()).toEqual(stepIds(sound.steps[1]));
  });

  it('rings a tweak’s control on hover, and clears it on leave', () => {
    setup();
    fireEvent.click(tab(/Make it yours/));
    const t = sound.tweaks[0];
    const item = within(panel()).getByText(t.try).closest('li');
    if (!item) throw new Error('no tweak');
    fireEvent.pointerEnter(item);
    expect(highlightStore.get()).toEqual([t.id]);
    fireEvent.pointerLeave(item);
    expect(highlightStore.get()).toEqual([]);
  });
});

describe('Lesson moving between steps and tabs', () => {
  it('goes back a step from the step bar’s arrow', () => {
    setup(null);
    fireEvent.click(tab(/Build it/));
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(within(visibleStep()).getByText(sound.steps[0].title)).toBeTruthy();
  });

  it('opens Make it yours from the overview, and starts from a blank patch on Build it', () => {
    const { onStep } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Ways to make it yours' }));
    expect(tab(/Make it yours/).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(tab(/Build it/));
    fireEvent.click(screen.getByRole('button', { name: 'Start from a blank patch' }));
    expect(onStep).toHaveBeenLastCalledWith(0);
  });

  it('ignores keys on the tabs that do not move between them', () => {
    setup();
    fireEvent.keyDown(tab(/How it works/), { key: 'a' });
    expect(tab(/How it works/).getAttribute('aria-selected')).toBe('true');
  });

  it('makes the step a swipe comes to rest on current, and moves the walkthrough to it', () => {
    vi.useFakeTimers();
    try {
      const { onStep } = setup(0);
      // The track holding the step cards, not the numbered step bar above it.
      const track = visibleStep().parentElement;
      if (!track) throw new Error('no track');
      Object.defineProperty(track, 'clientWidth', { configurable: true, value: 300 });
      Object.defineProperty(track, 'scrollLeft', { configurable: true, value: 600 });
      fireEvent.scroll(track);
      expect(onStep).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(140);
      });
      expect(onStep).toHaveBeenLastCalledWith(2);
      expect(within(visibleStep()).getByText(sound.steps[2].title)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Lesson tweaks', () => {
  it('lists each tweak and focuses its control in the inspector', () => {
    setup();
    fireEvent.click(tab(/Make it yours/));
    const t = sound.tweaks[0];
    expect(within(panel()).getByText(t.try)).toBeTruthy();
    expect(within(panel()).getByText(t.hear)).toBeTruthy();
    const c = controlMap(def)[t.id];
    if (!c) throw new Error(`no control ${t.id}`);
    fireEvent.click(within(panel()).getAllByRole('button', { name: displayName(def, c) })[0]);
    expect(focusStore.get()).toMatchObject({ kind: 'control', id: t.id });
  });
});
