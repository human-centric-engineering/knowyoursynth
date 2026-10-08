// @vitest-environment happy-dom

/**
 * `/synths` reopening the last synth.
 *
 * @see components/app/synth/reopen-synth.tsx
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReopenSynth, reopenTarget } from '@/components/app/synth/reopen-synth';
import { STORAGE_KEYS } from '@/components/app/synth/storage';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const IDS = ['model-d', 'minimoog'];

describe('reopenTarget', () => {
  it('lets a hash link win over the stored synth', () => {
    expect(reopenTarget(IDS, '#minimoog/outline', 'model-d')).toBe('/synths/minimoog?view=outline');
  });

  it('uses the stored synth when it is listed', () => {
    expect(reopenTarget(IDS, '', 'minimoog')).toBe('/synths/minimoog');
  });

  it('falls back to the first listed synth when the stored one is not listed', () => {
    expect(reopenTarget(IDS, '', 'retired')).toBe('/synths/model-d');
  });

  it.each([42, null, undefined, { id: 'minimoog' }, ['minimoog']])(
    'falls back to the first when the stored value is not a string: %j',
    (stored) => {
      expect(reopenTarget(IDS, '', stored)).toBe('/synths/model-d');
    }
  );

  it('ignores a hash naming an unlisted synth, or the bank', () => {
    expect(reopenTarget(IDS, '#unlisted', 'minimoog')).toBe('/synths/minimoog');
    expect(reopenTarget(IDS, '#bank/x', null)).toBe('/synths/model-d');
  });

  it('is null when nothing is listed, whatever else says', () => {
    expect(reopenTarget([], '#model-d', 'model-d')).toBeNull();
  });
});

describe('ReopenSynth', () => {
  beforeEach(() => {
    replace.mockClear();
    window.localStorage.clear();
    window.location.hash = '';
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('replaces the URL with the stored synth', () => {
    window.localStorage.setItem(STORAGE_KEYS.synth, JSON.stringify('minimoog'));
    render(<ReopenSynth ids={IDS} />);
    expect(replace).toHaveBeenCalledExactlyOnceWith('/synths/minimoog');
    expect(screen.getByRole('status').textContent).toBe('Opening your synth…');
  });

  it('replaces the URL with the first synth when nothing is stored', () => {
    render(<ReopenSynth ids={IDS} />);
    expect(replace).toHaveBeenCalledExactlyOnceWith('/synths/model-d');
  });

  it('follows a prototype hash link', () => {
    window.location.hash = '#minimoog/long';
    render(<ReopenSynth ids={IDS} />);
    expect(replace).toHaveBeenCalledExactlyOnceWith('/synths/minimoog?view=long');
  });

  it('says so, and goes nowhere, when no synths are listed', () => {
    render(<ReopenSynth ids={[]} />);
    expect(screen.getByRole('status').textContent).toBe('No synths are listed yet.');
    expect(replace).not.toHaveBeenCalled();
  });
});
