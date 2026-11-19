// @vitest-environment happy-dom

/**
 * The panel rails as dropdowns on a phone (t-286): the head's layers (`RailMenu`) and the foot's settings
 * (`PlayerSettings` with `menu`), each one key opening onto every choice by its full name.
 *
 * @see components/app/synth/player-tools.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayerSettings, RailMenu } from '@/components/app/synth/player-tools';
import type { RailMenuItem } from '@/components/app/synth/player-tools';

const item = (label: string, on = false, onClick = vi.fn()): RailMenuItem => ({
  label,
  icon: <svg aria-hidden="true" />,
  on,
  onClick,
});

function layers(groups: RailMenuItem[][]) {
  render(<RailMenu label="Layers over the panel" short="View" icon={<svg />} groups={groups} />);
  return screen.getByRole('button', { name: 'Layers over the panel' });
}

describe('RailMenu', () => {
  it('lights its LED while any layer is on, and not while none is', () => {
    const { unmount } = render(
      <RailMenu label="Layers" short="View" icon={<svg />} groups={[[item('Dim unused parts')]]} />
    );
    expect(screen.getByRole('button', { name: 'Layers' })).not.toHaveClass('is-on');
    unmount();
    render(
      <RailMenu
        label="Layers"
        short="View"
        icon={<svg />}
        groups={[[item('Dim unused parts'), item('Show sensitive controls', true)]]}
      />
    );
    expect(screen.getByRole('button', { name: 'Layers' })).toHaveClass('is-on');
  });

  it('shows nothing of the layers until it is opened, so no toggle is on the page twice', () => {
    layers([[item('Dim unused parts')]]);
    expect(screen.queryByRole('menuitemcheckbox')).toBeNull();
  });

  it('opens onto each layer by its full name, ticked while it is on, leaving out an empty group', async () => {
    const user = userEvent.setup();
    await user.click(
      layers([[], [item('Dim unused parts', true), item('Show sensitive controls')]])
    );
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitemcheckbox');
    expect(items.map((i) => i.textContent)).toEqual([
      'Dim unused parts',
      'Show sensitive controls',
    ]);
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
    expect(items[1]).toHaveAttribute('aria-checked', 'false');
    // The empty group draws no rule before the first.
    expect(within(menu).queryAllByRole('separator')).toHaveLength(0);
  });

  it('rules groups off from each other', async () => {
    const user = userEvent.setup();
    await user.click(layers([[item('Signal diagram')], [item('Dim unused parts')]]));
    expect(within(screen.getByRole('menu')).getAllByRole('separator')).toHaveLength(1);
  });

  it('turns a layer on, and stays open for the next', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    await user.click(layers([[item('Explain sections', false, onClick)]]));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Explain sections' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});

function settingsMenu(over: { layout?: 'modular'; language?: string } = {}) {
  const onView = vi.fn();
  const onZoom = vi.fn();
  const onTips = vi.fn();
  const onEnglish = vi.fn();
  render(
    <PlayerSettings
      menu
      view={{ outline: false, long: false }}
      onView={onView}
      layout={over.layout ?? null}
      zoom={2}
      onZoom={onZoom}
      tipsOn
      onTips={onTips}
      language={over.language}
      onEnglish={onEnglish}
    />
  );
  return { onView, onZoom, onTips, onEnglish };
}

describe('PlayerSettings as a menu', () => {
  it('is one key, with no line of LEDs', () => {
    settingsMenu();
    expect(screen.getByRole('button', { name: 'Panel settings' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Panel settings' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Outline' })).toBeNull();
  });

  it('opens onto each setting by name, its choice in use marked', async () => {
    const user = userEvent.setup();
    settingsMenu();
    await user.click(screen.getByRole('button', { name: 'Panel settings' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Drawn as')).toBeInTheDocument();
    expect(within(menu).getByText('Magnifier')).toBeInTheDocument();
    expect(within(menu).getByText('Hover help')).toBeInTheDocument();
    const lens = within(menu).getByRole('group', { name: 'Magnifier' });
    expect(within(lens).getByRole('menuitemradio', { name: '2×' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(within(lens).getByRole('menuitemradio', { name: 'Off' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('sends the picked choice as its own value: a flag, a number', async () => {
    const user = userEvent.setup();
    const { onView, onZoom } = settingsMenu();
    const open = () => user.click(screen.getByRole('button', { name: 'Panel settings' }));
    await open();
    await user.click(screen.getByRole('menuitemradio', { name: 'Outline' }));
    expect(onView).toHaveBeenCalledWith({ outline: true, long: false });
    await open();
    await user.click(screen.getByRole('menuitemradio', { name: '3×' }));
    expect(onZoom).toHaveBeenCalledWith(3);
  });

  it('turns hover help off', async () => {
    const user = userEvent.setup();
    const { onTips } = settingsMenu();
    await user.click(screen.getByRole('button', { name: 'Panel settings' }));
    const tips = within(screen.getByRole('menu')).getByRole('group', { name: 'Hover help' });
    await user.click(within(tips).getByRole('menuitemradio', { name: 'Off' }));
    expect(onTips).toHaveBeenCalledWith(false);
  });

  it('carries Layout and Labels where the synth has them', async () => {
    const user = userEvent.setup();
    const { onView, onEnglish } = settingsMenu({ layout: 'modular', language: 'Deutsch' });
    const open = () => user.click(screen.getByRole('button', { name: 'Panel settings' }));
    await open();
    await user.click(screen.getByRole('menuitemradio', { name: 'Long' }));
    expect(onView).toHaveBeenCalledWith({ outline: false, long: true });
    await open();
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }));
    expect(onEnglish).toHaveBeenCalledWith(true);
  });
});
