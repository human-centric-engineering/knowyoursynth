// @vitest-environment happy-dom

/**
 * The outboard effects rack: master switch, one card per unit, and a remembered fold.
 *
 * @see components/app/synth/fx-rack.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { FxRack } from '@/components/app/synth/fx-rack';
import { STORAGE_KEYS } from '@/components/app/synth/storage';
import { FX_DEFAULT } from '@/lib/app/synths/audio/fx';
import type { RackFx } from '@/lib/app/synths/audio/fx';

beforeEach(() => {
  window.localStorage.clear();
});

const fxWith = (over: Partial<RackFx> = {}): RackFx => ({
  ...structuredClone(FX_DEFAULT),
  ...over,
});

function setup(fx: RackFx = FX_DEFAULT, opts: { open?: boolean } = {}) {
  if (opts.open) window.localStorage.setItem(STORAGE_KEYS.fxOpen, 'true');
  const onChange = vi.fn();
  const utils = render(<FxRack fx={fx} onChange={onChange} />);
  return { ...utils, onChange };
}

const header = () => screen.getByRole('button', { name: /Effects rack/ });
const master = () => screen.getByRole('button', { name: /^Effects (on|off)$/ });
const sliderIn = (card: string, label: string) => {
  const unit = screen.getByText(card, { selector: 'span.kys-display' }).closest('div.rounded-lg');
  if (!(unit instanceof HTMLElement)) throw new Error(`no card for ${card}`);
  const el = within(unit).getByLabelText(label);
  if (!(el instanceof HTMLInputElement)) throw new Error(`${label} is not an input`);
  return el;
};

describe('FxRack collapsed summary', () => {
  it('says "off" while the master switch is off, whatever the units are set to', () => {
    setup(fxWith({ on: false }));
    expect(header().textContent).toContain('off');
    expect(header().getAttribute('aria-expanded')).toBe('false');
    expect(master().textContent).toBe('Effects off');
    expect(master().getAttribute('aria-pressed')).toBe('false');
  });

  it('lists the units that are switched on, in rack order, when the rack is on', () => {
    // Defaults: drive off, chorus + delay + reverb on.
    setup(fxWith({ on: true }));
    expect(header().textContent).toContain('Chorus · Delay · Reverb');
    expect(header().textContent).not.toContain('Drive');
    expect(master().textContent).toBe('Effects on');
    expect(master().getAttribute('aria-pressed')).toBe('true');
  });

  it('says no effects are switched on when the rack is on but every unit is off', () => {
    const base = structuredClone(FX_DEFAULT);
    const fx = fxWith({
      on: true,
      drive: { ...base.drive, on: false },
      chorus: { ...base.chorus, on: false },
      delay: { ...base.delay, on: false },
      reverb: { ...base.reverb, on: false },
    });
    setup(fx);
    expect(header().textContent).toContain('no effects switched on');
  });

  it('keeps the cards hidden while folded', () => {
    setup();
    expect(screen.queryByText('Drive')).toBeNull();
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
  });
});

describe('FxRack folding', () => {
  it('unfolds from the header and stores that under kys.fxOpen', () => {
    setup();
    fireEvent.click(header());

    expect(header().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('slider')).toHaveLength(9); // 2 + 2 + 3 + 2
    expect(window.localStorage.getItem('kys.fxOpen')).toBe('true');
    expect(STORAGE_KEYS.fxOpen).toBe('kys.fxOpen');
  });

  it('drops the summary text once it is unfolded', () => {
    setup(fxWith({ on: true }));
    fireEvent.click(header());
    expect(header().textContent).not.toContain('Chorus · Delay');
  });

  it('folds again and stores false', () => {
    setup();
    fireEvent.click(header());
    fireEvent.click(header());
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
    expect(window.localStorage.getItem('kys.fxOpen')).toBe('false');
  });

  it('starts unfolded when the stored preference says so', () => {
    setup(FX_DEFAULT, { open: true });
    expect(header().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('slider')).toHaveLength(9);
  });

  it('falls back to folded when the stored preference is not a boolean', () => {
    window.localStorage.setItem(STORAGE_KEYS.fxOpen, '"yes"');
    setup();
    expect(header().getAttribute('aria-expanded')).toBe('false');
  });
});

describe('FxRack master switch', () => {
  it('turns the rack on without touching the units, and unfolds it', () => {
    const { onChange } = setup(fxWith({ on: false }));

    fireEvent.click(master());

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...FX_DEFAULT, on: true });
    expect(header().getAttribute('aria-expanded')).toBe('true');
    expect(window.localStorage.getItem('kys.fxOpen')).toBe('true');
  });

  it('turns the rack off and leaves the fold as it was', () => {
    const { onChange } = setup(fxWith({ on: true }));

    fireEvent.click(master());

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...FX_DEFAULT, on: false });
    expect(header().getAttribute('aria-expanded')).toBe('false');
    expect(window.localStorage.getItem('kys.fxOpen')).toBeNull();
  });
});

describe('FxRack units', () => {
  it('switches one unit on, changing nothing else', () => {
    const { onChange } = setup(fxWith({ on: true }), { open: true });

    fireEvent.click(screen.getByRole('button', { name: 'Drive effect' }));

    const sent = onChange.mock.calls[0][0] as RackFx;
    expect(sent.drive).toEqual({ ...FX_DEFAULT.drive, on: true });
    expect(sent.chorus).toEqual(FX_DEFAULT.chorus);
    expect(sent.delay).toEqual(FX_DEFAULT.delay);
    expect(sent.reverb).toEqual(FX_DEFAULT.reverb);
    expect(sent.on).toBe(true);
  });

  it('switches one unit off', () => {
    const { onChange } = setup(fxWith({ on: true }), { open: true });
    const btn = screen.getByRole('button', { name: 'Reverb effect' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.textContent).toBe('On');

    fireEvent.click(btn);

    expect((onChange.mock.calls[0][0] as RackFx).reverb.on).toBe(false);
  });

  it('sends a slider change for that knob only', () => {
    const { onChange } = setup(fxWith({ on: true }), { open: true });

    fireEvent.change(sliderIn('Delay', 'Feedback'), { target: { value: '0.8' } });

    const sent = onChange.mock.calls[0][0] as RackFx;
    expect(sent.delay).toEqual({ ...FX_DEFAULT.delay, feedback: 0.8 });
    expect(sent.reverb).toEqual(FX_DEFAULT.reverb);
  });

  it('resets a knob to its FX_DEFAULT on double-click', () => {
    const moved = fxWith({ on: true });
    moved.reverb = { ...moved.reverb, size: 0.9, mix: 0.7 };
    const { onChange } = setup(moved, { open: true });

    fireEvent.doubleClick(sliderIn('Reverb', 'Size'));

    const sent = onChange.mock.calls[0][0] as RackFx;
    expect(sent.reverb.size).toBe(FX_DEFAULT.reverb.size);
    expect(sent.reverb.mix).toBe(0.7); // the other knob keeps its moved value
  });

  it("disables a unit's sliders while that unit is off, and enables them when it is on", () => {
    setup(fxWith({ on: true }), { open: true });
    // Drive is off in the defaults; Delay is on.
    expect(sliderIn('Drive', 'Amount').disabled).toBe(true);
    expect(sliderIn('Drive', 'Tone').disabled).toBe(true);
    expect(sliderIn('Delay', 'Time').disabled).toBe(false);
  });

  it("shows each knob's value in its own units", () => {
    setup(fxWith({ on: true }), { open: true });
    const readout = (card: string, label: string) =>
      sliderIn(card, label).closest('div')?.querySelector('span.font-mono')?.textContent;
    expect(readout('Delay', 'Time')).toBe('392 ms'); // 50 + 0.36 * 950
    expect(readout('Delay', 'Feedback')).toBe('35%');
    expect(readout('Reverb', 'Size')).toBe('2.8 s'); // 0.6 + 0.5 * 4.4
    expect(readout('Chorus', 'Rate')).toBe('0.4 Hz'); // 0.1 * 60^0.35 = 0.42
  });
});
