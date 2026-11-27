// @vitest-environment happy-dom

/**
 * The synth picker's site settings form (`f-synth-picker` t-329): opens on the settings it is given, saves them whole
 * with `PUT /api/v1/admin/synths/picker`, says it saved, shows a refused save by Save, and restores the original
 * settings into the form without saving them.
 *
 * @see components/app/admin/catalogue/picker-form.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PickerSettingsForm } from '@/components/app/admin/catalogue/picker-form';
import { apiClient, APIClientError } from '@/lib/api/client';
import { FACTORY_PICKER, type SitePickerSettings } from '@/lib/app/picker/settings';

const mockRefresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

const readOnly = vi.hoisted(() => ({ value: false }));
vi.mock('@/components/admin/shared-settings-access', () => ({
  useSharedSettingsReadOnly: () => readOnly.value,
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: { put: vi.fn() },
  APIClientError: class APIClientError extends Error {
    constructor(
      message: string,
      public code?: string,
      public status?: number,
      public details?: Record<string, unknown>
    ) {
      super(message);
    }
  },
}));
const put = vi.mocked(apiClient.put);

const SAVED: SitePickerSettings = {
  scope: 'all',
  group: 'lineage',
  order: 'old',
  kinds: ['modular'],
  thumbs: false,
  visitorsMayChange: false,
  offerAll: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  readOnly.value = false;
  put.mockImplementation(async (_url, opts) => (opts as { body: SitePickerSettings }).body);
});

const option = (name: string) => screen.getByRole('button', { name });

describe('PickerSettingsForm', () => {
  it('opens on the settings it is given', () => {
    render(<PickerSettingsForm initial={SAVED} />);
    expect(option('Lineage').getAttribute('aria-pressed')).toBe('true');
    expect(option('Oldest first').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'modular' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByRole('checkbox', { name: /Show panel thumbnails/ })).toHaveProperty(
      'checked',
      false
    );
    expect(screen.getByRole('checkbox', { name: /Let visitors change these/ })).toHaveProperty(
      'checked',
      false
    );
  });

  it('saves the settings whole, says so, and refreshes the page', async () => {
    const user = userEvent.setup();
    render(<PickerSettingsForm initial={FACTORY_PICKER} />);
    await user.click(option('Name A–Z'));
    await user.click(screen.getByRole('button', { name: 'poly' }));
    await user.click(screen.getByRole('checkbox', { name: /Let visitors change these/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(put).toHaveBeenCalledExactlyOnceWith('/api/v1/admin/synths/picker', {
      body: { ...FACTORY_PICKER, group: 'name', kinds: ['poly'], visitorsMayChange: false },
    });
    expect((await screen.findByRole('status')).textContent).toContain('Saved');
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it('saves the order and every switch as set', async () => {
    const user = userEvent.setup();
    render(<PickerSettingsForm initial={FACTORY_PICKER} />);
    await user.click(option('Oldest first'));
    await user.click(screen.getByRole('checkbox', { name: /Show panel thumbnails/ }));
    await user.click(screen.getByRole('checkbox', { name: /Offer .All synths ever made./ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(put).toHaveBeenCalledWith('/api/v1/admin/synths/picker', {
      body: { ...FACTORY_PICKER, order: 'old', thumbs: false, offerAll: false },
    });
  });

  it('saves what visitors are shown by default', async () => {
    const user = userEvent.setup();
    render(<PickerSettingsForm initial={FACTORY_PICKER} />);
    expect(option('Synths that play').getAttribute('aria-pressed')).toBe('true');
    await user.click(option('All synths ever made'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(put).toHaveBeenCalledWith('/api/v1/admin/synths/picker', {
      body: { ...FACTORY_PICKER, scope: 'all' },
    });
  });

  it('says when every synth is the default but is not offered', async () => {
    const user = userEvent.setup();
    render(<PickerSettingsForm initial={{ ...FACTORY_PICKER, offerAll: false }} />);
    expect(screen.queryByText(/is not offered/)).toBeNull();
    await user.click(option('All synths ever made'));
    expect(screen.getByText(/is not offered/)).toBeTruthy();
  });

  it('takes a kind back out of the list', async () => {
    const user = userEvent.setup();
    render(<PickerSettingsForm initial={SAVED} />);
    await user.click(screen.getByRole('button', { name: 'modular' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(put).toHaveBeenCalledWith('/api/v1/admin/synths/picker', {
      body: { ...SAVED, kinds: [] },
    });
  });

  it('shows a refused save by Save', async () => {
    const user = userEvent.setup();
    put.mockRejectedValue(new APIClientError('Invalid request body', 'VALIDATION_ERROR', 400));
    render(<PickerSettingsForm initial={FACTORY_PICKER} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('resets the form to the original settings, saying they are not saved yet', async () => {
    const user = userEvent.setup();
    render(<PickerSettingsForm initial={SAVED} />);
    await user.click(
      screen.getByRole('button', { name: 'Reset the form to the original settings' })
    );
    expect(option('Maker').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('status').textContent).toContain('Press Save');
    expect(put).not.toHaveBeenCalled();
  });

  it('clears a refused save once the form is changed', async () => {
    const user = userEvent.setup();
    put.mockRejectedValue(new APIClientError('Server error', 'INTERNAL_ERROR', 500));
    render(<PickerSettingsForm initial={FACTORY_PICKER} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    await user.click(option('Lineage'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('cannot be changed or saved where shared settings are read-only', () => {
    readOnly.value = true;
    render(<PickerSettingsForm initial={SAVED} />);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
    expect(option('Maker')).toHaveProperty('disabled', true);
  });
});
