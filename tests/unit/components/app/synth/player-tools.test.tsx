// @vitest-environment happy-dom

/**
 * The player bar's tools: a layer toggle, and the ⚙ menu that holds how the panel is drawn.
 *
 * @see components/app/synth/player-tools.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LayerToggle, PlayerSettings } from '@/components/app/synth/player-tools';

function settings(over: Partial<Parameters<typeof PlayerSettings>[0]> = {}) {
  const props = {
    view: { outline: false, long: false },
    onView: vi.fn(),
    modular: false,
    zoom: 0,
    onZoom: vi.fn(),
    tipsOn: true,
    onTips: vi.fn(),
    ...over,
  };
  render(<PlayerSettings {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Panel settings' }));
  return { ...props, menu: within(screen.getByRole('dialog', { name: 'Panel settings' })) };
}

describe('PlayerSettings', () => {
  it('is shut until its button is pressed', () => {
    render(
      <PlayerSettings
        view={{ outline: false, long: false }}
        onView={vi.fn()}
        modular={false}
        zoom={0}
        onZoom={vi.fn()}
        tipsOn
        onTips={vi.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Outline' })).toBeNull();
  });

  it('sends the magnifier choice, and Off as 0', () => {
    const { menu, onZoom } = settings({ zoom: 2 });
    const lens = within(menu.getByRole('group', { name: 'Magnifier' }));
    expect(lens.getByRole('button', { name: '2×' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(lens.getByRole('button', { name: '3×' }));
    fireEvent.click(lens.getByRole('button', { name: 'Off' }));
    expect(onZoom.mock.calls).toEqual([[3], [0]]);
  });

  it('offers no Modular or Long for a synth without a modular layout', () => {
    expect(settings().menu.queryByRole('group', { name: 'Panel layout' })).toBeNull();
  });

  it('switches the layout without touching Hardware or Outline', () => {
    const { menu, onView } = settings({ modular: true, view: { outline: true, long: false } });
    fireEvent.click(
      within(menu.getByRole('group', { name: 'Panel layout' })).getByRole('button', {
        name: 'Long',
      })
    );
    expect(onView).toHaveBeenCalledExactlyOnceWith({ outline: true, long: true });
  });

  it('turns the hover cards off', () => {
    const { menu, onTips } = settings();
    fireEvent.click(
      within(menu.getByRole('group', { name: 'Hover cards' })).getByRole('button', { name: 'Off' })
    );
    expect(onTips).toHaveBeenCalledExactlyOnceWith(false);
  });
});

describe('LayerToggle', () => {
  it('is named in full and says whether it is on', () => {
    const onClick = vi.fn();
    render(
      <LayerToggle
        label="Dim unused parts"
        short="Dim"
        title="t"
        icon={null}
        on
        onClick={onClick}
      />
    );
    const b = screen.getByRole('button', { name: 'Dim unused parts' });
    expect(b.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
