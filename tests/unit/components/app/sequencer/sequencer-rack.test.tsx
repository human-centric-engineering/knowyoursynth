// @vitest-environment happy-dom

/**
 * The sequencer's rack chassis (t-281), put away under an unmodelled family member's blank panel (t-321).
 *
 * @see components/app/sequencer/sequencer-rack.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SequencerRack } from '@/components/app/sequencer/sequencer-rack';
import { PlayerTips } from '@/components/app/synth/player-tip';

const rack = (away?: boolean) => {
  const { container, rerender } = render(
    <PlayerTips>
      <SequencerRack running={false} onPower={vi.fn()} away={away}>
        <p>the module</p>
      </SequencerRack>
    </PlayerTips>
  );
  return { el: () => container.querySelector<HTMLElement>('.kys-rack'), rerender };
};

describe('SequencerRack', () => {
  it('shows the module it holds', () => {
    const { el } = rack();
    expect(el()?.style.display).toBe('');
    expect(screen.getByText('the module')).toBeTruthy();
  });

  it('hides away without taking the module down, so it comes back as it was', () => {
    const { el, rerender } = rack(true);
    const before = el();
    expect(before?.style.display).toBe('none');
    const held = screen.getByText('the module');
    rerender(
      <PlayerTips>
        <SequencerRack running={false} onPower={vi.fn()}>
          <p>the module</p>
        </SequencerRack>
      </PlayerTips>
    );
    expect(el()).toBe(before);
    expect(el()?.style.display).toBe('');
    expect(screen.getByText('the module')).toBe(held);
  });
});
