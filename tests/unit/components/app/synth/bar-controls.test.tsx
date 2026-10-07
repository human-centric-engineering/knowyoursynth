// @vitest-environment happy-dom

/**
 * The small controls over and under the faceplate: help dialog, panel switches, segmented switch, MIDI status.
 *
 * @see components/app/synth/bar-controls.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  HelpButton,
  MidiStatus,
  PanelSwitch,
  Segmented,
} from '@/components/app/synth/bar-controls';
import type { Midi, MidiStatus as Status } from '@/components/app/synth/use-midi';

describe('HelpButton', () => {
  const ITEMS = [
    ['Knobs', 'Drag up or down to turn.'],
    ['Switches', 'Click to change.'],
  ] as const;

  it('shows only the "?" button until it is pressed', () => {
    render(<HelpButton title="How to use the panel" items={ITEMS} />);
    const button = screen.getByRole('button', { name: 'How to use the panel' });
    expect(button.textContent).toBe('?');
    expect(button.getAttribute('title')).toBe('How to use the panel');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a dialog titled by the button, listing each term with its text', () => {
    render(<HelpButton title="How to use the panel" items={ITEMS} />);
    fireEvent.click(screen.getByRole('button', { name: 'How to use the panel' }));

    const dialog = screen.getByRole('dialog', { name: 'How to use the panel' });
    const terms = within(dialog)
      .getAllByRole('term')
      .map((t) => t.textContent);
    const details = within(dialog)
      .getAllByRole('definition')
      .map((d) => d.textContent);
    expect(terms).toEqual(['Knobs', 'Switches']);
    expect(details).toEqual(['Drag up or down to turn.', 'Click to change.']);
  });

  it('closes on Escape', () => {
    render(<HelpButton title="How to play" items={ITEMS} />);
    fireEvent.click(screen.getByRole('button', { name: 'How to play' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('PanelSwitch', () => {
  const base = { label: 'Explain sections', short: 'Sections', title: 'Colour in every part.' };

  it('reports its state with aria-pressed and is named by the full label', () => {
    const { rerender } = render(<PanelSwitch {...base} on={false} onClick={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Explain sections' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('title')).toBe('Colour in every part.');

    rerender(<PanelSwitch {...base} on onClick={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Explain sections' }).getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('carries both the short and the full label, with the short one hidden from wide screens', () => {
    render(<PanelSwitch {...base} on={false} onClick={vi.fn()} />);
    const button = screen.getByRole('button');
    expect(within(button).getByText('Sections').className).toContain('xl:hidden');
    expect(within(button).getByText('Explain sections').className).toContain('xl:inline');
  });

  it('calls onClick when pressed', () => {
    const onClick = vi.fn();
    render(<PanelSwitch {...base} on={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['start', true, 'bg-(--kys-accent) text-(--kys-accent-ink)'],
    ['start', false, 'bg-(--kys-surface) text-(--kys-accent)'],
    ['view', true, 'bg-(--kys-accent) text-(--kys-accent-ink)'],
    ['view', false, 'text-(--kys-muted)'],
    ['quiet', true, 'text-(--kys-text)'],
    ['quiet', false, 'text-(--kys-muted)'],
  ] as const)('the %s tone, on=%s, is drawn with %s', (tone, on, cls) => {
    render(<PanelSwitch {...base} tone={tone} on={on} onClick={vi.fn()} />);
    expect(screen.getByRole('button').className).toContain(cls);
  });

  it('defaults to the view tone', () => {
    render(<PanelSwitch {...base} on={false} onClick={vi.fn()} />);
    // Off "view": muted text, line border. Off "start" would be outlined in the accent.
    expect(screen.getByRole('button').className).toContain('border-(--kys-line)');
  });

  it('outlines the start tone in the accent even when it is off', () => {
    render(<PanelSwitch {...base} tone="start" on={false} onClick={vi.fn()} />);
    expect(screen.getByRole('button').className).toContain('border-(--kys-accent)');
  });
});

describe('Segmented', () => {
  const OPTIONS = [
    [false, 'Hardware'],
    [true, 'Outline'],
  ] as const;

  it('is a labelled group with the chosen option pressed', () => {
    render(<Segmented label="Panel view" options={OPTIONS} value={true} onChange={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'Panel view' });
    expect(
      within(group).getByRole('button', { name: 'Outline' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      within(group).getByRole('button', { name: 'Hardware' }).getAttribute('aria-pressed')
    ).toBe('false');
  });

  it('calls onChange with the option value (not its text)', () => {
    const onChange = vi.fn();
    render(<Segmented label="Panel view" options={OPTIONS} value={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Outline' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('passes numeric and string values through unchanged', () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Zoom"
        options={[
          [0, 'Off'],
          [2, '2×'],
        ]}
        value={0}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '2×' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('carries the title on the group', () => {
    render(
      <Segmented
        label="Layout"
        title="Modular or long"
        options={OPTIONS}
        value={false}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole('group', { name: 'Layout' }).getAttribute('title')).toBe(
      'Modular or long'
    );
  });
});

describe('MidiStatus', () => {
  function midi(status: Status, devices: string[] = []): Midi {
    return {
      status,
      devices,
      error: '',
      connect: vi.fn().mockResolvedValue(true),
      disconnect: vi.fn(),
    };
  }
  const setup = (m: Midi) => {
    const onConnect = vi.fn();
    render(<MidiStatus midi={m} onConnect={onConnect} />);
    return onConnect;
  };

  it('offers Connect MIDI when off, and says nothing else', () => {
    const onConnect = setup(midi('off'));
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Connect MIDI' }));

    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('disables the button while the browser is being asked, and says it is waiting', () => {
    const onConnect = setup(midi('asking'));
    const button = screen.getByRole('button', { name: 'Connect MIDI' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Waiting for the browser to allow MIDI…');

    fireEvent.click(button);
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('offers Try MIDI again, with a warning, when blocked', () => {
    const onConnect = setup(midi('blocked'));
    const note = screen.getByRole('status');
    expect(note.textContent).toContain('MIDI was not allowed.');
    expect(note.className).toContain('text-(--kys-warn)');

    fireEvent.click(screen.getByRole('button', { name: 'Try MIDI again' }));

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Connect MIDI' })).toBeNull();
  });

  it('offers Stop MIDI when on, which disconnects rather than connects', () => {
    const m = midi('on');
    const onConnect = setup(m);

    fireEvent.click(screen.getByRole('button', { name: 'Stop MIDI' }));

    expect(m.disconnect).toHaveBeenCalledTimes(1);
    expect(onConnect).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Connect MIDI|Try MIDI again/ })).toBeNull();
  });

  it('lists the connected devices in the good colour when on', () => {
    setup(midi('on', ['Arturia KeyStep', 'Moog Little Phatty']));
    const note = screen.getByRole('status');
    expect(note.textContent).toBe('Listening to Arturia KeyStep, Moog Little Phatty');
    expect(note.className).toContain('text-(--kys-good)');
  });

  it('says no keyboard is connected when on with no devices', () => {
    setup(midi('on'));
    const note = screen.getByRole('status');
    expect(note.textContent).toContain('MIDI is on, but no keyboard is connected.');
    expect(note.className).not.toContain('text-(--kys-good)');
  });

  it.each([
    ['unsupported', 'This browser has no MIDI support.'],
    ['frame', 'MIDI keyboards cannot connect while this page is shown inside another site.'],
  ] as const)('explains %s and offers no button', (status, text) => {
    setup(midi(status));
    expect(screen.getByRole('status').textContent).toContain(text);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
