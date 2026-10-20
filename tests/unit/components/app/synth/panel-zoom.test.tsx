// @vitest-environment happy-dom

/**
 * The panel's size: fitted to the page, or zoomed in its scroller.
 *
 * @see components/app/synth/panel-zoom.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  PANEL_SCALES,
  PanelZoom,
  panelFrameStyle,
  useKeepCentre,
} from '@/components/app/synth/panel-zoom';
import type { PanelScale } from '@/components/app/synth/panel-zoom';

describe('panelFrameStyle', () => {
  it('fits a drawn panel to the scroller, up to 1560 px, with no minimum width', () => {
    expect(panelFrameStyle(null, 1)).toEqual({ width: 'calc(1 * min(100%, 1560px))' });
  });

  it('keeps a synth with its own layout short enough for the screen', () => {
    // 82vh of height at a 4:1 panel is 328vh of width.
    expect(panelFrameStyle({ w: 4000, h: 1000 }, 1)).toEqual({
      width: 'calc(1 * min(100%, min(1560px, 328.0vh)))',
    });
  });

  it('multiplies the fitted width by the scale', () => {
    expect(panelFrameStyle(null, 2).width).toBe('calc(2 * min(100%, 1560px))');
    expect(panelFrameStyle({ w: 4000, h: 1000 }, 3).width).toBe(
      'calc(3 * min(100%, min(1560px, 328.0vh)))'
    );
  });
});

function Zoom({ start = 1 as PanelScale, onScale = vi.fn() }) {
  const [scale, setScale] = useState<PanelScale>(start);
  return (
    <PanelZoom
      scale={scale}
      onScale={(s) => {
        onScale(s);
        setScale(s);
      }}
    />
  );
}

const btn = (name: string) => screen.getByRole('button', { name });

describe('PanelZoom', () => {
  it('starts at Fit, steps in through each scale and back out', () => {
    const onScale = vi.fn();
    render(<Zoom onScale={onScale} />);
    expect(btn('Fit the panel to the page').textContent).toBe('Fit');
    expect(btn('Fit the panel to the page').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(btn('Zoom in'));
    fireEvent.click(btn('Zoom in'));
    fireEvent.click(btn('Zoom in'));
    expect(onScale.mock.calls).toEqual([[1.5], [2], [3]]);
    expect(btn('Fit the panel to the page').textContent).toBe('300%');
    expect(btn('Fit the panel to the page').getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(btn('Zoom out'));
    expect(onScale).toHaveBeenLastCalledWith(2);
    expect(btn('Fit the panel to the page').textContent).toBe('200%');
  });

  it('cannot zoom out past Fit or in past the largest scale', () => {
    const { unmount } = render(<Zoom />);
    expect(btn('Zoom out').hasAttribute('disabled')).toBe(true);
    expect(btn('Zoom in').hasAttribute('disabled')).toBe(false);
    unmount();

    render(<Zoom start={PANEL_SCALES[PANEL_SCALES.length - 1]} />);
    expect(btn('Zoom in').hasAttribute('disabled')).toBe(true);
    expect(btn('Zoom out').hasAttribute('disabled')).toBe(false);
  });

  it('goes straight back to Fit from any scale', () => {
    const onScale = vi.fn();
    render(<Zoom start={3} onScale={onScale} />);
    fireEvent.click(btn('Fit the panel to the page'));
    expect(onScale).toHaveBeenCalledExactlyOnceWith(1);
    expect(btn('Fit the panel to the page').textContent).toBe('Fit');
  });
});

describe('useKeepCentre', () => {
  function Scroller({ scale }: { scale: PanelScale }) {
    const ref = useKeepCentre(scale);
    return <div ref={ref} data-testid="scroller" />;
  }

  it('keeps the middle of the view in the middle when the scale changes', () => {
    const { rerender } = render(<Scroller scale={1} />);
    const el = screen.getByTestId('scroller');
    Object.defineProperty(el, 'clientWidth', { value: 400 });
    const scrollTo = vi.fn();
    el.scrollTo = scrollTo as typeof el.scrollTo;
    el.scrollLeft = 100; // the middle of the view is at 300
    fireEvent.scroll(el);

    act(() => rerender(<Scroller scale={2} />));
    // At twice the size that point is at 600, so the view starts 200 to its left.
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ left: 400 });
  });

  it('measures the middle from the frame when it is centred in a wider scroller', () => {
    function Framed({ scale }: { scale: PanelScale }) {
      const ref = useKeepCentre(scale);
      return (
        <div ref={ref} data-testid="scroller">
          <div data-testid="frame" />
        </div>
      );
    }
    const { rerender } = render(<Framed scale={1} />);
    const el = screen.getByTestId('scroller');
    Object.defineProperty(el, 'clientWidth', { value: 1400 });
    // Fitted, the frame is 900 wide with 250 either side; at 2x it is 1800, wider than the scroller.
    Object.defineProperty(screen.getByTestId('frame'), 'offsetWidth', { value: 1800 });
    const scrollTo = vi.fn();
    el.scrollTo = scrollTo as typeof el.scrollTo;
    el.scrollLeft = 0; // in view: the frame's middle, 450 along it
    fireEvent.scroll(el);

    act(() => rerender(<Framed scale={2} />));
    // That point is now 900 along the frame, so the view starts 700 to its left.
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ left: 200 });
  });

  it('keeps the middle from before the zoom, though zooming out has already pulled the view in', () => {
    const { rerender } = render(<Scroller scale={3} />);
    const el = screen.getByTestId('scroller');
    Object.defineProperty(el, 'clientWidth', { value: 400 });
    const scrollTo = vi.fn();
    el.scrollTo = scrollTo as typeof el.scrollTo;
    el.scrollLeft = 1100; // at 3x, the middle of the view is at 1300
    fireEvent.scroll(el);
    el.scrollLeft = 600; // the browser pulls it in when the panel shrinks, before the zoom is handled

    act(() => rerender(<Scroller scale={2} />));
    // At 2x that point is at 866.7, so the view starts 200 to its left.
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ left: 2600 / 3 - 200 });
  });

  it('remembers where the browser stops, not a target past the end, for the next zoom', () => {
    const { rerender } = render(<Scroller scale={1} />);
    const el = screen.getByTestId('scroller');
    Object.defineProperty(el, 'clientWidth', { value: 400 });
    Object.defineProperty(el, 'scrollWidth', { value: 900, configurable: true });
    const scrollTo = vi.fn();
    el.scrollTo = scrollTo as typeof el.scrollTo;
    el.scrollLeft = 300;
    fireEvent.scroll(el);

    act(() => rerender(<Scroller scale={2} />)); // aims at 800, but the view can only go to 500
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 800 });
    act(() => rerender(<Scroller scale={1} />)); // from 500 at 2x: the middle at 700, so 350 at 1x
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 150 });
  });

  it('does not scroll before the left edge when zooming out', () => {
    const { rerender } = render(<Scroller scale={3} />);
    const el = screen.getByTestId('scroller');
    Object.defineProperty(el, 'clientWidth', { value: 400 });
    const scrollTo = vi.fn();
    el.scrollTo = scrollTo as typeof el.scrollTo;
    el.scrollLeft = 0;

    act(() => rerender(<Scroller scale={1} />));
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ left: 0 });
  });

  it('leaves the scroll alone when the scale is unchanged', () => {
    const { rerender } = render(<Scroller scale={2} />);
    const el = screen.getByTestId('scroller');
    const scrollTo = vi.fn();
    el.scrollTo = scrollTo as typeof el.scrollTo;
    act(() => rerender(<Scroller scale={2} />));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
