// @vitest-environment happy-dom

/**
 * SynthEditor (`f-catalogue-admin` t-31): one synth's details, sounds, lineage and notes, a tab each, from one detail.
 *
 * @see components/app/admin/synths/synth-editor.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SynthEditor } from '@/components/app/admin/synths/synth-editor';
import { adminSynthDetail } from '@/tests/helpers/admin-synth-detail';

vi.mock('@/lib/api/client', () => ({
  apiClient: { put: vi.fn(), patch: vi.fn(), post: vi.fn() },
  APIClientError: class APIClientError extends Error {},
}));

describe('SynthEditor', () => {
  it('opens on the details, and shows each part of the synth on its tab', async () => {
    const user = userEvent.setup();
    render(<SynthEditor detail={adminSynthDetail()} />);

    expect(screen.getByRole('button', { name: 'Save details' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Sounds (1)' }));
    expect(screen.getByTestId('sound-row-funk-bass')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a sound' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Lineage' }));
    expect(screen.getByDisplayValue('Where the Model D comes from')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Notes' }));
    expect(screen.getByTestId('note-unusual-1')).toBeInTheDocument();
    expect(screen.getByTestId('note-shared-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument();
  });

  it('offers no new sound or note for a synth with no definition', async () => {
    const user = userEvent.setup();
    render(<SynthEditor detail={adminSynthDetail({ definitionVersion: null })} tab="sounds" />);

    expect(screen.queryByRole('link', { name: 'Add a sound' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Notes' }));
    expect(screen.queryByRole('button', { name: 'Add note' })).not.toBeInTheDocument();
  });
});
