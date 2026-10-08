// @vitest-environment happy-dom

/**
 * The lineage dialog, over Model D's lineage as the read layer serves it.
 *
 * @see components/app/synth/lineage.tsx
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Lineage } from '@/components/app/synth/lineage';
import { getSynthDetail } from '@/lib/app/catalogue/read';
import type { Lineage as LineageData } from '@/lib/app/synths/contract';
import { modelDRows } from '@/tests/helpers/model-d-detail';

vi.mock('@/lib/db/client', () => ({
  prisma: { synth: { findFirst: vi.fn() }, synthNote: { findMany: vi.fn() } },
}));

const SYNTH = { id: 'model-d', maker: 'Behringer', name: 'Model D' };
let lineage: LineageData;

beforeAll(async () => {
  const { prisma } = await import('@/lib/db/client');
  const { stored, noteRows } = modelDRows();
  vi.mocked(prisma.synth.findFirst).mockResolvedValue(stored as never);
  vi.mocked(prisma.synthNote.findMany).mockResolvedValue(noteRows as never);
  const detail = await getSynthDetail('model-d');
  if (!detail?.lineage) throw new Error('no Model D lineage');
  lineage = detail.lineage;
});

function setup(over: Partial<LineageData> = {}, open = true) {
  const onClose = vi.fn();
  const utils = render(
    <Lineage synth={SYNTH} lineage={{ ...lineage, ...over }} open={open} onClose={onClose} />
  );
  const dialog = utils.container.querySelector('dialog');
  if (!dialog) throw new Error('no dialog');
  return { ...utils, onClose, dialog };
}

const tab = (name: RegExp) => screen.getByRole('tab', { name });

describe('Lineage', () => {
  it('stays closed until opened, then shows the title and intro', () => {
    const { dialog, rerender, onClose } = setup({}, false);
    expect(dialog.open).toBe(false);
    rerender(<Lineage synth={SYNTH} lineage={lineage} open onClose={onClose} />);
    expect(dialog.open).toBe(true);
    expect(within(dialog).getByRole('heading', { name: lineage.title })).toBeTruthy();
    expect(within(dialog).getByText(lineage.intro)).toBeTruthy();
    expect(within(dialog).getByText('Lineage · Behringer Model D')).toBeTruthy();
  });

  it('opens on the timeline: every entry, its year and its tag', () => {
    const { dialog } = setup();
    expect(lineage.timeline.length).toBeGreaterThan(1);
    expect(tab(/How it got here/).getAttribute('aria-selected')).toBe('true');
    expect(tab(/How it got here/).textContent).toContain(String(lineage.timeline.length));
    const items = within(screen.getByRole('tabpanel')).getAllByRole('listitem');
    expect(items).toHaveLength(lineage.timeline.length);
    lineage.timeline.forEach((t, i) => {
      expect(items[i].textContent).toContain(t.year);
      expect(items[i].textContent).toContain(t.name);
      expect(items[i].textContent).toContain(t.text);
      if (t.tag) expect(items[i].textContent).toContain(t.tag);
    });
    expect(dialog.open).toBe(true);
  });

  it('shows the close relatives on their tab', () => {
    setup();
    fireEvent.click(tab(/Close relatives/));
    const items = within(screen.getByRole('tabpanel')).getAllByRole('listitem');
    expect(items).toHaveLength(lineage.relatives.length);
    expect(items[0].textContent).toContain(lineage.relatives[0].name);
    expect(items[0].textContent).toContain(lineage.relatives[0].years);
  });

  it('has no Heard on tab while the lineage names no players: the records come with the databank', () => {
    setup();
    expect(lineage.users ?? []).toEqual([]);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.queryByRole('tab', { name: /Heard on/ })).toBeNull();
  });

  it('lists the players and the caveat under Heard on when the lineage has them', () => {
    setup({ users: ['Player One', 'Player Two'], note: 'An incomplete list.' });
    fireEvent.click(tab(/Heard on/));
    const body = screen.getByRole('tabpanel');
    expect(within(body).getByText('Player One · Player Two')).toBeTruthy();
    expect(within(body).getByText('An incomplete list.')).toBeTruthy();
  });

  it('tells the page it closed, from × or a click on the backdrop', () => {
    const { dialog, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(dialog.open).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);

    dialog.showModal();
    // A click inside the content does not close it.
    fireEvent.click(within(dialog).getByText(lineage.intro));
    expect(dialog.open).toBe(true);
    fireEvent.click(dialog);
    expect(dialog.open).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
