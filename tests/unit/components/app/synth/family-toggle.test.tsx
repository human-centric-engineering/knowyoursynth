// @vitest-environment happy-dom

/**
 * The version toggle by the player's caption, and the note on what a switch carried (`f-synth-families` t-320).
 *
 * @see components/app/synth/family-toggle.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import {
  CarriedNote,
  FamilyToggle,
  useOwnedInstruments,
} from '@/components/app/synth/family-toggle';
import { TB_303_FAMILY } from '@/tests/helpers/synth-family';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }));
vi.mock('@/lib/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api/client')>();
  return { ...real, apiClient: api };
});

const OFFERED = new Set(['td-3', 'tb-303']);

describe('FamilyToggle', () => {
  it('shows a segment for each modelled member the catalogue offers, the open one pressed', () => {
    render(
      <FamilyToggle family={TB_303_FAMILY} synthId="td-3" offered={OFFERED} onSwitch={vi.fn()} />
    );
    const group = screen.getByRole('group', { name: 'TB-303 versions' });
    const segments = within(group).getAllByRole('button');
    expect(segments.map((b) => b.textContent)).toEqual(['TD-3', 'TB-303']);
    expect(segments.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });

  it('switches to the member chosen, and not to the one already open', () => {
    const onSwitch = vi.fn();
    render(
      <FamilyToggle family={TB_303_FAMILY} synthId="td-3" offered={OFFERED} onSwitch={onSwitch} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'TD-3' }));
    expect(onSwitch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'TB-303' }));
    expect(onSwitch).toHaveBeenCalledExactlyOnceWith('tb-303');
  });

  it('shows nothing when fewer than two members are offered', () => {
    const { container } = render(
      <FamilyToggle
        family={TB_303_FAMILY}
        synthId="td-3"
        offered={new Set(['td-3'])}
        onSwitch={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('CarriedNote', () => {
  it('names each setting that did not carry, once, and what carried changed', () => {
    const onDismiss = vi.fn();
    render(
      <CarriedNote
        note={{
          fromName: 'TD-3',
          dropped: [
            { kind: 'control', id: 'dist.drive', value: 4, reason: 'The TB-303 has no distortion' },
            { kind: 'control', id: 'dist.on', value: true, reason: 'The TB-303 has no distortion' },
          ],
          changed: [
            {
              id: 'osc.tune',
              value: 10,
              to: { id: 'osc.tuning', value: 5 },
              reason: "The TB-303's TUNING goes from -5 to 5; 10 became 5",
            },
          ],
        }}
        onDismiss={onDismiss}
      />
    );
    const note = screen.getByRole('status');
    expect(note.textContent).toContain('Panel carried over from the TD-3');
    expect(
      within(note)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual([
      'The TB-303 has no distortion',
      "The TB-303's TUNING goes from -5 to 5; 10 became 5",
    ]);
    fireEvent.click(within(note).getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('says all of it came across when nothing was dropped or changed', () => {
    render(<CarriedNote note={{ fromName: 'TB-303', dropped: [], changed: [] }} />);
    expect(screen.getByRole('status').textContent).toContain('from the TB-303, all of it.');
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});

describe('useOwnedInstruments', () => {
  const entry = (instrumentId: string, kind: 'owned' | 'wishlist') => ({
    instrumentId,
    kind,
    name: instrumentId,
    maker: 'Maker',
    year: '1981',
    addedAt: '2026-11-26T00:00:00.000Z',
  });

  it('asks nothing while signed out, and owns nothing', () => {
    api.get.mockReset();
    const { result } = renderHook(() => useOwnedInstruments(null));
    expect(api.get).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it("holds the user's owned instruments, not their wishlist", async () => {
    api.get.mockReset().mockResolvedValue({
      owned: [entry('roland-tb-303', 'owned')],
      wishlist: [entry('behringer-td-3', 'wishlist')],
    });
    const { result } = renderHook(() => useOwnedInstruments('u-1'));
    await waitFor(() => expect(result.current.has('roland-tb-303')).toBe(true));
    expect(api.get).toHaveBeenCalledExactlyOnceWith('/api/v1/me/instruments');
    expect(result.current.has('behringer-td-3')).toBe(false);
  });

  it("drops one user's instruments when another signs in", async () => {
    api.get
      .mockReset()
      .mockResolvedValueOnce({ owned: [entry('roland-tb-303', 'owned')], wishlist: [] });
    api.get.mockReturnValueOnce(new Promise(() => undefined));
    const { result, rerender } = renderHook(({ id }) => useOwnedInstruments(id), {
      initialProps: { id: 'u-1' },
    });
    await waitFor(() => expect(result.current.size).toBe(1));
    rerender({ id: 'u-2' });
    expect(result.current.size).toBe(0);
  });

  it('owns nothing when the answer is not the shape it should be, or the read fails', async () => {
    api.get.mockReset().mockResolvedValue({ owned: 'nope' });
    const bad = renderHook(() => useOwnedInstruments('u-1'));
    await waitFor(() => expect(api.get).toHaveBeenCalledOnce());
    expect(bad.result.current.size).toBe(0);

    api.get.mockReset().mockRejectedValue(new Error('offline'));
    const failed = renderHook(() => useOwnedInstruments('u-1'));
    await waitFor(() => expect(api.get).toHaveBeenCalledOnce());
    expect(failed.result.current.size).toBe(0);
  });
});
