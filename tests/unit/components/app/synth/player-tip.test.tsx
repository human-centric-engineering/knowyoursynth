// @vitest-environment happy-dom

/**
 * The player's tooltip: a button's name and what it does, on focus, under the player's one provider or its own.
 *
 * @see components/app/synth/player-tip.tsx
 */

import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlayerTip, PlayerTips, TipSide } from '@/components/app/synth/player-tip';

describe('PlayerTip', () => {
  it('names the button and says what it does on focus, under the player’s provider', () => {
    render(
      <PlayerTips>
        <PlayerTip name="Mute" help="Silence the synth.">
          <button type="button">M</button>
        </PlayerTip>
        <PlayerTip name="Piano">
          <button type="button">P</button>
        </PlayerTip>
      </PlayerTips>
    );
    fireEvent.focus(screen.getByRole('button', { name: 'M' }));
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toBe('MuteSilence the synth.');
  });

  it('brings its own provider outside the player', () => {
    render(
      <PlayerTip name="Piano">
        <button type="button">P</button>
      </PlayerTip>
    );
    fireEvent.focus(screen.getByRole('button', { name: 'P' }));
    expect(screen.getByRole('tooltip').textContent).toBe('Piano');
  });

  const sideOf = (name: string) => {
    fireEvent.focus(screen.getByRole('button', { name }));
    return document.querySelector('.kys-tip')?.getAttribute('data-side');
  };

  it('opens above by default', () => {
    render(
      <PlayerTip name="Piano">
        <button type="button">P</button>
      </PlayerTip>
    );
    expect(sideOf('P')).toBe('top');
  });

  it('opens on the side a TipSide around it says, unless it names its own', () => {
    render(
      <PlayerTips>
        <TipSide side="bottom">
          <PlayerTip name="Live signal">
            <button type="button">L</button>
          </PlayerTip>
          <PlayerTip name="Undo" side="top">
            <button type="button">U</button>
          </PlayerTip>
        </TipSide>
      </PlayerTips>
    );
    expect(sideOf('L')).toBe('bottom');
    fireEvent.blur(screen.getByRole('button', { name: 'L' }));
    expect(sideOf('U')).toBe('top');
  });
});
