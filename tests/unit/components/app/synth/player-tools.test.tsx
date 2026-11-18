// @vitest-environment happy-dom

/**
 * The player bar's tools: a layer toggle, the Signal layer's menu, and the panel settings, on show under the panel.
 *
 * @see components/app/synth/player-tools.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  LayerToggle,
  PlayerSettings,
  SignalFlow,
  type SignalMode,
} from '@/components/app/synth/player-tools';
import { chooseSignal } from '@/tests/helpers/signal-menu';

function settings(
  over: {
    layout?: 'modular' | 'compact';
    zoom?: number;
    view?: { outline: boolean; long: boolean };
    language?: string;
    english?: boolean;
  } = {}
) {
  const onView = vi.fn();
  const onZoom = vi.fn();
  const onTips = vi.fn();
  const onEnglish = vi.fn();
  render(
    <PlayerSettings
      view={over.view ?? { outline: false, long: false }}
      onView={onView}
      layout={over.layout ?? null}
      zoom={over.zoom ?? 0}
      onZoom={onZoom}
      tipsOn
      onTips={onTips}
      language={over.language}
      english={over.english}
      onEnglish={onEnglish}
    />
  );
  const menu = within(screen.getByRole('group', { name: 'Panel settings' }));
  return { onView, onZoom, onTips, onEnglish, menu };
}

describe('PlayerSettings', () => {
  it('shows every setting at once, with no button to open them', () => {
    const { menu } = settings({ layout: 'modular' });
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

  it('offers no Labels switch for a panel printed in English', () => {
    expect(settings().menu.queryByRole('group', { name: 'Panel labels' })).toBeNull();
  });

  it('offers a panel printed in another language in that language or in English', () => {
    const { menu, onEnglish } = settings({ language: 'Russian', english: false });
    const labels = within(menu.getByRole('group', { name: 'Panel labels' }));
    expect(labels.getByRole('button', { name: 'Russian' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    fireEvent.click(labels.getByRole('button', { name: 'English' }));
    expect(onEnglish.mock.calls).toEqual([[true]]);
  });

  it('offers no Layout setting for a synth with only its full faceplate', () => {
    expect(settings().menu.queryByRole('group', { name: 'Panel layout' })).toBeNull();
  });

  it('switches the layout without touching Hardware or Outline', () => {
    const { menu, onView } = settings({ layout: 'modular', view: { outline: true, long: false } });
    fireEvent.click(
      within(menu.getByRole('group', { name: 'Panel layout' })).getByRole('button', {
        name: 'Long',
      })
    );
    expect(onView).toHaveBeenCalledExactlyOnceWith({ outline: true, long: true });
  });

  it('names the compact layout Compact and the whole faceplate Full, and says what Compact leaves out', () => {
    const { menu, onView } = settings({ layout: 'compact' });
    const layout = menu.getByRole('group', { name: 'Panel layout' });
    expect(layout).toHaveAccessibleDescription(
      /Compact leaves out .*keys.*Full is the whole faceplate/
    );
    const buttons = within(layout);
    expect(buttons.getByRole('button', { name: 'Compact' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(buttons.queryByRole('button', { name: 'Modular' })).toBeNull();
    fireEvent.click(buttons.getByRole('button', { name: 'Full' }));
    expect(onView).toHaveBeenCalledExactlyOnceWith({ outline: false, long: true });
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

describe('SignalFlow', () => {
  function draw(live: boolean, mode: SignalMode = 'inUse') {
    const onMode = vi.fn();
    const view = render(<SignalFlow mode={mode} onMode={onMode} live={live} icon={null} />);
    return { onMode, view };
  }
  const offered = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Ways to show the signal flow' }));
    return [...document.querySelectorAll('.kys-signal-name')].map((n) => n.textContent);
  };
  const main = (name: string) => screen.getByRole('button', { name: `Signal flow: ${name}` });

  it('offers Live on a synth whose signal it can show, and chooses it', () => {
    const { onMode } = draw(true);
    chooseSignal('Live');
    expect(onMode).toHaveBeenCalledWith('live');
    expect(offered()).toEqual(['Off', 'Path', 'Live', 'Live + lines']);
  });

  it('offers Live + lines beside it, and chooses it', () => {
    const { onMode } = draw(true);
    chooseSignal('Live + lines');
    expect(onMode).toHaveBeenCalledWith('flow');
  });

  it('leaves Live and Live + lines out on a synth without a routing', () => {
    draw(false);
    expect(offered()).toEqual(['Off', 'Path']);
  });

  it('draws each mode in the menu', () => {
    draw(true);
    offered();
    const drawn = [...document.querySelectorAll('.kys-signal-opt .kys-flow-preview')].map((svg) =>
      svg.getAttribute('class')
    );
    expect(drawn).toEqual([
      'kys-flow-preview is-off',
      'kys-flow-preview is-inUse',
      'kys-flow-preview is-live',
      'kys-flow-preview is-flow',
    ]);
    // Only Live + lines draws the line between the parts.
    expect(document.querySelectorAll('.kys-flow-preview-line')).toHaveLength(1);
  });

  it('turns on Live from its main press the first time, where the synth can show it', () => {
    const { onMode } = draw(true, 'off');
    expect(main('Off')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(main('Off'));
    expect(onMode).toHaveBeenLastCalledWith('live');
  });

  it('turns on Path from its main press on a synth without a routing', () => {
    const { onMode } = draw(false, 'off');
    fireEvent.click(main('Off'));
    expect(onMode).toHaveBeenLastCalledWith('inUse');
  });

  it('turns off from its main press, and back on in the mode it was in', () => {
    const { onMode, view } = draw(true, 'flow');
    fireEvent.click(main('Live + lines'));
    expect(onMode).toHaveBeenLastCalledWith('off');
    view.rerender(<SignalFlow mode="off" onMode={onMode} live icon={null} />);
    fireEvent.click(main('Off'));
    expect(onMode).toHaveBeenLastCalledWith('flow');
  });

  it('turns back on in the mode last chosen from the rail', () => {
    const { onMode, view } = draw(true, 'off');
    const rail = screen.getByRole('group', { name: 'Signal flow modes' });
    fireEvent.click(within(rail).getByRole('button', { name: 'Path' }));
    expect(onMode).toHaveBeenLastCalledWith('inUse');
    view.rerender(<SignalFlow mode="off" onMode={onMode} live icon={null} />);
    fireEvent.click(main('Off'));
    expect(onMode).toHaveBeenLastCalledWith('inUse');
  });

  it('has its modes on the rail as LEDs too, the one in use pressed', () => {
    draw(true, 'live');
    const rail = screen.getByRole('group', { name: 'Signal flow modes' });
    const pressed = within(rail)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent);
    expect(pressed).toEqual(['Live']);
  });
});
