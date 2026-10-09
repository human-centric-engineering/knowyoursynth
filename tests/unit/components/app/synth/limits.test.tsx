// @vitest-environment happy-dom

/**
 * The "What is not modelled" dialog, over Model D's limit notes and the shared ones, as the read layer serves them.
 *
 * @see components/app/synth/limits.tsx
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Limits } from '@/components/app/synth/limits';
import { getSynthDetail } from '@/lib/app/catalogue/read';
import type { SynthDetail } from '@/lib/app/catalogue/read';
import { modelDRows } from '@/tests/helpers/model-d-detail';

vi.mock('@/lib/db/client', () => ({
  prisma: { synth: { findFirst: vi.fn() }, synthNote: { findMany: vi.fn() } },
}));

const SYNTH = { maker: 'Behringer', name: 'Model D' };
let limits: SynthDetail['notes']['limits'];

beforeAll(async () => {
  const { prisma } = await import('@/lib/db/client');
  const { stored, noteRows } = modelDRows();
  vi.mocked(prisma.synth.findFirst).mockResolvedValue(stored as never);
  vi.mocked(prisma.synthNote.findMany).mockResolvedValue(noteRows as never);
  const detail = await getSynthDetail('model-d');
  if (!detail) throw new Error('no Model D detail');
  limits = detail.notes.limits;
});

function setup(over: Partial<SynthDetail['notes']['limits']> = {}, open = true) {
  const onClose = vi.fn();
  const utils = render(
    <Limits synth={SYNTH} limits={{ ...limits, ...over }} open={open} onClose={onClose} />
  );
  const dialog = utils.container.querySelector('dialog');
  if (!dialog) throw new Error('no dialog');
  return { ...utils, onClose, dialog };
}

/** The `dt` → `dd` pairs under a heading. */
const entries = (heading: string) => {
  const list = screen.getByText(heading).nextElementSibling;
  if (!list) throw new Error(`nothing under ${heading}`);
  return [...list.querySelectorAll('dt')].map((dt) => [
    dt.textContent,
    dt.nextElementSibling?.textContent,
  ]);
};

describe('Limits', () => {
  it('has Model D’s intro, its own entries and the shared ones to show', () => {
    expect(limits.intro).toBeTruthy();
    expect(limits.items.length).toBeGreaterThan(0);
    expect(limits.shared.length).toBeGreaterThan(0);
  });

  it('stays closed until opened, then names the synth and shows its intro', () => {
    const { dialog, rerender, onClose } = setup({}, false);
    expect(dialog.open).toBe(false);
    rerender(<Limits synth={SYNTH} limits={limits} open onClose={onClose} />);
    expect(dialog.open).toBe(true);
    expect(within(dialog).getByRole('heading', { name: 'What is not modelled' })).toBeTruthy();
    expect(within(dialog).getByText('Behringer Model D')).toBeTruthy();
    expect(within(dialog).getByText(limits.intro ?? '')).toBeTruthy();
  });

  it('lists this synth’s entries, then the ones true of every synth, in the order served', () => {
    setup();
    expect(entries('On this synth')).toEqual(limits.items.map((l) => [l.title, l.text]));
    expect(entries('True of every synth here')).toEqual(
      limits.shared.map((l) => [l.title, l.text])
    );
  });

  it('shows only the shared entries for a synth with none of its own', () => {
    setup({ intro: null, items: [] });
    expect(screen.queryByText('On this synth')).toBeNull();
    expect(entries('True of every synth here')).toHaveLength(limits.shared.length);
  });

  it('tells the page it closed, from × or a click on the backdrop', () => {
    const { dialog, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(dialog.open).toBe(false);
    dialog.showModal();
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(dialog.open).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
