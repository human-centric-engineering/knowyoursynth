// @vitest-environment happy-dom

/**
 * The inspector (beside the panel) and the tooltip (following the pointer), run against the real Model D definition.
 *
 * @see components/app/synth/inspector.tsx
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Inspector, Tooltip } from '@/components/app/synth/inspector';
import type { InspectorProps, TooltipProps } from '@/components/app/synth/inspector';
import { findStore, focusStore, pendingStore } from '@/components/app/synth/stores';
import type { CableFocus, Focus, ItemFocus } from '@/components/app/synth/stores';
import { withNotes } from '@/components/app/synth/with-notes';
import { getSynthDef } from '@/lib/app/synths/defs';
import type { PatchCable } from '@/lib/app/synths/contract';

const baseDef = getSynthDef('model-d');
if (!baseDef) throw new Error('model-d is not registered');

const NOTE = 'Moog printed this as a number, not a frequency.';
const AREA_NOTE = 'The filter is a four-pole ladder.';
const JACK_NOTE = 'This socket is a quarter-inch jack.';
const def = withNotes(baseDef, {
  'filter.cutoff': NOTE,
  filter: AREA_NOTE,
  'j.cutCv': JACK_NOTE,
});

const CUTOFF_HELP = 'Where the filter starts cutting.';
const CUT_AT_INIT = '1 · 1.3 kHz'; // filter.cutoff's init value, as the panel prints it
const CUT_AT_3 = '3 · 5.0 kHz';
const CABLE_TITLE = 'LFO (triangle) → CUT CV';
const CABLE: PatchCable = { from: 'j.lfoTri', to: 'j.cutCv', color: '#e0572b' };

afterEach(() => {
  focusStore.set(null);
  findStore.set(null);
  pendingStore.set(null);
});

const control = (id: string, over: Partial<ItemFocus> = {}): Focus => ({
  kind: 'control',
  id,
  x: 100,
  y: 100,
  tip: true,
  ...over,
});
const cableFocus = (from: string, to: string, over: Partial<CableFocus> = {}): Focus => ({
  kind: 'cable',
  id: `${from}>${to}`,
  from,
  to,
  x: 100,
  y: 100,
  tip: true,
  ...over,
});
const focus = (f: Focus | null) => act(() => focusStore.set(f));

function inspector(over: Partial<InspectorProps> = {}) {
  const props: InspectorProps = {
    def,
    values: def.init,
    target: def.init,
    preset: null,
    cables: [],
    onChange: vi.fn(),
    onConnect: vi.fn(),
    onUnplug: vi.fn(),
    ...over,
  };
  return { ...render(<Inspector {...props} />), props };
}

function tooltip(over: Partial<TooltipProps> = {}) {
  const props: TooltipProps = {
    def,
    values: def.init,
    target: null,
    preset: null,
    cables: [],
    ...over,
  };
  return { ...render(<Tooltip {...props} />), props };
}

describe('Inspector', () => {
  it('explains how to use it when nothing is focused', () => {
    inspector();
    expect(screen.getByRole('heading', { name: 'Control inspector' })).toBeTruthy();
    expect(screen.getByText(/Hover or touch any knob, switch, jack or cable/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows a focused control: its name, value, help and the module it belongs to', () => {
    inspector();
    focus(control('filter.cutoff', { tip: false }));

    expect(screen.getByText('CUTOFF FREQUENCY')).toBeTruthy();
    expect(screen.getByText(CUT_AT_INIT)).toBeTruthy();
    expect(screen.getByText(new RegExp(CUTOFF_HELP))).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Filter');
    expect(screen.queryByText(/Control inspector/)).toBeNull();
  });

  it('follows the live value when a knob moves', () => {
    const { rerender, props } = inspector();
    focus(control('filter.cutoff'));
    expect(screen.getByText(CUT_AT_INIT)).toBeTruthy();

    rerender(<Inspector {...props} values={{ ...def.init, 'filter.cutoff': 3 }} />);

    expect(screen.getByText(CUT_AT_3)).toBeTruthy();
  });

  it('shows the "Unusual on" note when the definition item carries one, and not otherwise', () => {
    inspector();
    focus(control('filter.cutoff'));
    expect(screen.getByText('Unusual on the Model D')).toBeTruthy();
    expect(screen.getByText(NOTE)).toBeTruthy();

    focus(control('filter.emphasis'));
    expect(screen.queryByText('Unusual on the Model D')).toBeNull();
  });

  it('shows what the control is doing in this sound, from the preset context', () => {
    inspector({ preset: { context: { 'filter.cutoff': 'Almost closed for a dull thud.' } } });
    focus(control('filter.cutoff'));
    expect(screen.getByText('In this sound:')).toBeTruthy();
    expect(screen.getByText('Almost closed for a dull thud.')).toBeTruthy();

    focus(control('filter.emphasis'));
    expect(screen.queryByText('In this sound:')).toBeNull();
  });

  it('offers no "Put it back" while the value is where the sound has it', () => {
    inspector();
    focus(control('filter.cutoff'));
    expect(screen.queryByRole('button', { name: 'Put it back' })).toBeNull();
    expect(screen.queryByText(/The sound has this at/)).toBeNull();
  });

  it('offers "Put it back" when the value differs, saying where the sound had it, and puts it back with null', () => {
    const { props } = inspector({ values: { ...def.init, 'filter.cutoff': 3 }, target: def.init });
    focus(control('filter.cutoff'));
    expect(screen.getByText(/The sound has this at/).textContent).toContain(CUT_AT_INIT);
    expect(props.onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Put it back' }));

    expect(props.onChange).toHaveBeenCalledExactlyOnceWith('filter.cutoff', null);
  });

  it('explains a focused jack: its name, direction and how to patch it', () => {
    inspector();
    focus({ kind: 'jack', id: 'j.lfoTri', x: 0, y: 0, tip: false });

    expect(screen.getByText('LFO (triangle) output')).toBeTruthy();
    expect(screen.getByText(/To patch: click this jack/)).toBeTruthy();
    expect(screen.getByText(/hover over any input/)).toBeTruthy();
  });

  it('says "any output" for an input jack, and shows the jack\'s unusual note', () => {
    inspector();
    focus({ kind: 'jack', id: 'j.cutCv', x: 0, y: 0, tip: false });
    expect(screen.getByText('CUT CV input')).toBeTruthy();
    expect(screen.getByText(/hover over any output/)).toBeTruthy();
    expect(screen.getByText(JACK_NOTE)).toBeTruthy();
  });

  it('explains a focused area, and lists its members as buttons that find and focus them', () => {
    inspector();
    focus({ kind: 'area', id: 'filter', x: 0, y: 0, tip: false });

    expect(screen.getByText('Filter and filter contour')).toBeTruthy();
    expect(screen.getByText(AREA_NOTE)).toBeTruthy();
    expect(screen.getByText(/In this section/)).toBeTruthy();
    for (const name of ['CUTOFF FREQUENCY', 'EMPHASIS', 'ATTACK · filter env']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole('button', { name: 'EMPHASIS' }));

    expect(findStore.get()).toEqual({ kind: 'control', id: 'filter.emphasis' });
    expect(focusStore.get()).toEqual({
      kind: 'control',
      id: 'filter.emphasis',
      x: 0,
      y: 0,
      tip: false,
    });
  });

  it("lists an area's jacks with their direction, and focusing one sets the stores", () => {
    inspector();
    focus({ kind: 'area', id: 'patch', x: 0, y: 0, tip: false });

    fireEvent.click(screen.getByRole('button', { name: 'CUT CV in' }));

    expect(findStore.get()).toEqual({ kind: 'jack', id: 'j.cutCv' });
    expect(focusStore.get()).toMatchObject({ kind: 'jack', id: 'j.cutCv', tip: false });
  });

  it('explains an unplugged cable and plugs it in on request', () => {
    const { props } = inspector();
    focus(cableFocus('j.lfoTri', 'j.cutCv', { tip: false }));

    expect(screen.getByText(CABLE_TITLE)).toBeTruthy();
    expect(screen.getByText('not plugged in')).toBeTruthy();
    expect(screen.getByText(/Filter wobble: the cutoff rises and falls/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unplug' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Plug it in' }));

    expect(props.onConnect).toHaveBeenCalledExactlyOnceWith('j.lfoTri', 'j.cutCv');
    expect(props.onUnplug).not.toHaveBeenCalled();
  });

  it('explains a plugged cable and unplugs it on request', () => {
    const { props } = inspector({ cables: [CABLE] });
    focus(cableFocus('j.lfoTri', 'j.cutCv', { tip: false }));

    expect(screen.getByText('plugged in')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Plug it in' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Unplug' }));

    expect(props.onUnplug).toHaveBeenCalledExactlyOnceWith('j.lfoTri', 'j.cutCv');
    expect(props.onConnect).not.toHaveBeenCalled();
  });

  it('falls back to the idle card for a cable focus naming jacks the synth does not have', () => {
    inspector();
    focus(cableFocus('j.nope', 'j.cutCv'));
    expect(screen.getByRole('heading', { name: 'Control inspector' })).toBeTruthy();
  });

  it('lists every cable in the patch, focuses one on click and unplugs with its ×', () => {
    const second: PatchCable = { from: 'j.filtCont', to: 'j.loudCv', color: '#2b8fe0' };
    const { props } = inspector({ cables: [CABLE, second] });

    expect(screen.getByRole('heading', { name: 'Cables in this patch · 2' })).toBeTruthy();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText(CABLE_TITLE)).toBeTruthy();
    expect(within(items[1]).getByText('FILT CONT → LOUD CV')).toBeTruthy();
    expect(within(items[0]).getByText('Filter wobble.')).toBeTruthy();

    fireEvent.click(within(items[0]).getByText(CABLE_TITLE));
    expect(focusStore.get()).toEqual({
      kind: 'cable',
      id: 'j.lfoTri>j.cutCv',
      from: 'j.lfoTri',
      to: 'j.cutCv',
      x: 0,
      y: 0,
      tip: false,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Unplug FILT CONT → LOUD CV' }));
    expect(props.onUnplug).toHaveBeenCalledExactlyOnceWith('j.filtCont', 'j.loudCv');
  });

  it('shows no cable list when the patch has no cables', () => {
    inspector();
    expect(screen.queryByText(/Cables in this patch/)).toBeNull();
  });
});

describe('Tooltip', () => {
  it('renders nothing with no focus', () => {
    const { container } = tooltip();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the focus has tip: false', () => {
    const { container } = tooltip();
    focus(control('filter.cutoff', { tip: false }));
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a focus that names nothing on this synth', () => {
    const { container } = tooltip();
    focus(control('no.such.control'));
    expect(container.firstChild).toBeNull();
  });

  it('renders a control card with its name, value, help and unusual note', () => {
    tooltip();
    focus(control('filter.cutoff'));

    const card = screen.getByRole('tooltip');
    expect(within(card).getByText('CUTOFF FREQUENCY')).toBeTruthy();
    expect(within(card).getByText(CUT_AT_INIT)).toBeTruthy();
    expect(within(card).getByText(new RegExp(CUTOFF_HELP))).toBeTruthy();
    expect(within(card).getByText(NOTE)).toBeTruthy();
  });

  it("adds the sound's own words and the sound's setting when the knob has been moved", () => {
    tooltip({
      values: { ...def.init, 'filter.cutoff': 3 },
      target: def.init,
      preset: { context: { 'filter.cutoff': 'Closed down for the dull thud.' } },
    });
    focus(control('filter.cutoff'));

    const card = screen.getByRole('tooltip');
    expect(within(card).getByText(CUT_AT_3)).toBeTruthy();
    expect(within(card).getByText('Closed down for the dull thud.')).toBeTruthy();
    expect(within(card).getByText(`Sound setting: ${CUT_AT_INIT}`)).toBeTruthy();
  });

  it('omits the sound setting when the knob is where the sound has it', () => {
    tooltip({ target: def.init });
    focus(control('filter.cutoff'));
    expect(screen.queryByText(/Sound setting/)).toBeNull();
  });

  it('is hidden when info cards are off', () => {
    const { container } = tooltip({ enabled: false });
    focus(control('filter.cutoff'));
    expect(container.firstChild).toBeNull();
  });

  it('still guides a cable being plugged in when info cards are off', () => {
    tooltip({ enabled: false });
    act(() => pendingStore.set('j.lfoTri'));
    focus({ kind: 'jack', id: 'j.cutCv', x: 100, y: 100, tip: true });

    const card = screen.getByRole('tooltip');
    expect(card.textContent).toContain('If you plug it in here');
    expect(card.textContent).toContain('Filter modulation');
    expect(card.textContent).toContain(CABLE_TITLE);
    expect(card.textContent).toContain('Click to plug the cable in, or press Esc to drop it.');
  });

  it('works out the cable whichever way round the held and hovered jacks are', () => {
    tooltip();
    act(() => pendingStore.set('j.cutCv'));
    focus({ kind: 'jack', id: 'j.lfoTri', x: 100, y: 100, tip: true });
    expect(screen.getByRole('tooltip').textContent).toContain(CABLE_TITLE);
  });

  it('says the two are already connected when the hovered pair has a cable', () => {
    tooltip({ cables: [CABLE] });
    act(() => pendingStore.set('j.lfoTri'));
    focus({ kind: 'jack', id: 'j.cutCv', x: 100, y: 100, tip: true });
    expect(screen.getByRole('tooltip').textContent).toContain('These two are already connected.');
  });

  it('warns when the held jack and the hovered jack are both outputs', () => {
    tooltip();
    act(() => pendingStore.set('j.lfoTri'));
    focus({ kind: 'jack', id: 'j.mix', x: 100, y: 100, tip: true });
    const card = screen.getByRole('tooltip');
    expect(card.textContent).toContain('You are holding LFO (triangle), which is also an output');
    expect(card.textContent).not.toContain('If you plug it in here');
  });

  it('shows a plain jack card, with the cables on it and the how-to hint', () => {
    tooltip({ cables: [CABLE] });
    focus({ kind: 'jack', id: 'j.cutCv', x: 100, y: 100, tip: true });
    const card = screen.getByRole('tooltip');
    expect(card.textContent).toContain('CUT CV · input');
    expect(card.textContent).toContain(JACK_NOTE);
    expect(card.textContent).toContain('LFO (triangle) → CUT CV.');
    expect(card.textContent).toContain('Filter wobble.');
    expect(card.textContent).toContain('Click, then hover over any output');
  });

  it('explains a hovered cable, and tells you how to unplug a plugged one', () => {
    tooltip({ cables: [CABLE] });
    focus(cableFocus('j.lfoTri', 'j.cutCv'));
    const card = screen.getByRole('tooltip');
    expect(card.textContent).toContain('Patch cable');
    expect(card.textContent).toContain('Click the cable to unplug it.');
  });

  it('explains a plug being dragged to a jack as a prospect, even with info cards off', () => {
    tooltip({ enabled: false });
    focus(cableFocus('j.lfoTri', 'j.cutCv', { prospect: true }));
    const card = screen.getByRole('tooltip');
    expect(card.textContent).toContain('If you move the plug here');
    expect(card.textContent).toContain('Let go to plug it in here.');
  });

  it('describes a section with where it is and what is in it', () => {
    tooltip();
    focus({ kind: 'area', id: 'filter', x: 100, y: 100, tip: true });
    const card = screen.getByRole('tooltip');
    expect(card.textContent).toContain('Section · Filter');
    expect(card.textContent).toContain('Filter and filter contour');
    expect(card.textContent).toContain(AREA_NOTE);
    expect(card.textContent).toContain('Here: CUTOFF FREQUENCY, EMPHASIS');
  });

  it('clears a sticky card on the next pointer press anywhere, and only once', () => {
    tooltip();
    focus(control('filter.cutoff', { sticky: true }));
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.pointerDown(window);

    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(focusStore.get()).toMatchObject({ id: 'filter.cutoff', tip: false, sticky: false });
  });

  it('leaves a non-sticky card up when the pointer is pressed', () => {
    tooltip();
    focus(control('filter.cutoff'));
    fireEvent.pointerDown(window);
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('does not clear a sticky card that has since moved on to another control', () => {
    tooltip();
    focus(control('filter.cutoff', { sticky: true }));
    // The focus moves on before the press: the new item is not sticky, so the listener is gone.
    focus(control('filter.emphasis'));
    fireEvent.pointerDown(window);
    expect(focusStore.get()).toMatchObject({ id: 'filter.emphasis', tip: true });
  });

  it('keeps the card on screen: flips left near the right edge, and above the pointer low down', () => {
    tooltip();
    focus(control('filter.cutoff', { x: window.innerWidth - 10, y: window.innerHeight - 20 }));
    const style = screen.getByRole('tooltip').style;
    expect(parseFloat(style.left)).toBeLessThan(window.innerWidth - 10);
    expect(style.bottom).not.toBe('');
    expect(style.top).toBe('');
  });
});
