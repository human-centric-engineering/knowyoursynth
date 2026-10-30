// @vitest-environment happy-dom

/**
 * The player bar's tools: a layer toggle, the Signal layer's menu, and the panel settings, on show under the panel.
 *
 * @see components/app/synth/player-tools.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LayerToggle, PlayerSettings, SignalMenu } from '@/components/app/synth/player-tools';
import { chooseSignal } from '@/tests/helpers/signal-menu';

function settings(
  over: { modular?: boolean; zoom?: number; view?: { outline: boolean; long: boolean } } = {}
) {
  const onView = vi.fn();
  const onZoom = vi.fn();
  const onTips = vi.fn();
  render(
    <PlayerSettings
      view={over.view ?? { outline: false, long: false }}
      onView={onView}
      modular={over.modular ?? false}
      zoom={over.zoom ?? 0}
      onZoom={onZoom}
      tipsOn
      onTips={onTips}
    />
  );
  const menu = within(screen.getByRole('group', { name: 'Panel settings' }));
  return { onView, onZoom, onTips, menu };
}

describe('PlayerSettings', () => {
  it('shows every setting at once, with no button to open them', () => {
    const { menu } = settings({ modular: true });
    expect(screen.queryByRole('button', { name: 'Panel settings' })).toBeNull();
    for (const name of ['Panel view', 'Panel layout', 'Magnifier', 'Hover help']) {
      expect(menu.getByRole('group', { name })).toBeTruthy();
    }
  });

  it('describes each setting by what it does, for a keyboard that cannot reach its name', () => {
    const { menu } = settings();
    const lens = menu.getByRole('group', { name: 'Magnifier' });
    expect(lens).toHaveAccessibleDescription('A lens that follows the pointer over the panel.');
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
      within(menu.getByRole('group', { name: 'Hover help' })).getByRole('button', { name: 'Off' })
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

describe('SignalMenu', () => {
  function draw(live: boolean) {
    const onMode = vi.fn();
    render(<SignalMenu mode="inUse" onMode={onMode} live={live} icon={null} />);
    return onMode;
  }
  const offered = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Signal on the panel: In use' }));
    return [...document.querySelectorAll('.kys-signal-name')].map((n) => n.textContent);
  };

  it('offers Live on a synth whose signal it can show, and chooses it', () => {
    const onMode = draw(true);
    chooseSignal('Live');
    expect(onMode).toHaveBeenCalledWith('live');
    expect(offered()).toEqual(['Off', 'In use', 'Live']);
  });

  it('leaves Live out on a synth without a routing', () => {
    draw(false);
    expect(offered()).toEqual(['Off', 'In use']);
  });
});
