// @vitest-environment happy-dom

/**
 * What a pattern picker shows while patterns are found (`f-pattern-prefetch` t-264): placeholder rows hidden from
 * screen readers, the bar offering a newer list, and the one status a screen reader hears.
 *
 * @see components/app/sequencer/pattern-finding.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FindingRows, FresherBar, findingStatus } from '@/components/app/sequencer/pattern-finding';

describe('FindingRows', () => {
  it('draws the sections and rows asked for, each section headed, all hidden from screen readers', () => {
    const { container } = render(<FindingRows sections={2} rows={3} />);
    const root = container.firstElementChild;
    expect(root?.getAttribute('aria-hidden')).toBe('true');
    expect(root?.className).toBe('kys-patfind');
    expect(container.querySelectorAll('.kys-patfind-section')).toHaveLength(2);
    expect(container.querySelectorAll('.kys-patfind-h')).toHaveLength(2);
    expect(container.querySelectorAll('.kys-patfind-row')).toHaveLength(6);
  });

  it('draws tiles without placeholder headings where the real heading is shown', () => {
    const { container } = render(<FindingRows heading={false} rows={4} grid />);
    expect(container.firstElementChild?.className).toBe('kys-patfind is-grid');
    expect(container.querySelectorAll('.kys-patfind-h')).toHaveLength(0);
    expect(container.querySelectorAll('.kys-patfind-row')).toHaveLength(4);
  });
});

describe('FresherBar', () => {
  it('says the patch has changed, and takes the newer list when Update the list is pressed', () => {
    const onTake = vi.fn();
    render(<FresherBar onTake={onTake} />);
    expect(screen.getByText('The patch has changed.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Update the list' }));
    expect(onTake).toHaveBeenCalledTimes(1);
  });

  it('keeps focus in the picker when taking the list takes the bar away', async () => {
    function Around() {
      const [shown, setShown] = useState(true);
      return (
        <div>
          <input aria-label="Search" />
          {shown && <FresherBar onTake={() => setShown(false)} />}
        </div>
      );
    }
    render(<Around />);
    const take = screen.getByRole('button', { name: 'Update the list' });
    take.focus();
    fireEvent.click(take);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Search')));
  });
});

describe('findingStatus', () => {
  it('says patterns are being found, then how many were', () => {
    expect(findingStatus('reading', null)).toBe('Finding patterns that suit the patch');
    expect(findingStatus('ready', 1)).toBe('Found 1 pattern');
    expect(findingStatus('ready', 7)).toBe('Found 7 patterns');
    expect(findingStatus('ready', 0)).toBe('Found 0 patterns');
  });

  it('says it is waiting for the sound to load', () => {
    expect(findingStatus('off', null)).toBe('Waiting for the sound on the panel to load');
  });

  it('says how many are shown when there was nothing to ask', () => {
    expect(findingStatus('near', 6)).toBe('Found 6 patterns');
  });

  it('says nothing when failed or with no count', () => {
    expect(findingStatus('error', 3)).toBe('');
    expect(findingStatus('ready', null)).toBe('');
    expect(findingStatus('near', null)).toBe('');
  });
});
