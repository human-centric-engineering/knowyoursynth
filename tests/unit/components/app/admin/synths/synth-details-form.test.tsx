// @vitest-environment happy-dom

/**
 * SynthDetailsForm (`f-catalogue-admin` t-31): a synth's descriptive columns through `PATCH /api/v1/admin/synths/[id]`.
 *
 * @see components/app/admin/synths/synth-details-form.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SharedSettingsAccessProvider } from '@/components/admin/shared-settings-access';
import { SynthDetailsForm } from '@/components/app/admin/synths/synth-details-form';
import { apiClient, APIClientError } from '@/lib/api/client';
import { adminSynthDetail } from '@/tests/helpers/admin-synth-detail';

vi.mock('@/lib/api/client', () => ({
  apiClient: { patch: vi.fn() },
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

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const patch = vi.mocked(apiClient.patch);
const SYNTH = adminSynthDetail().synth;
/** A field by its label; the label also names its ⓘ button, so ask for the input. */
const INPUT = { selector: 'input, textarea' };

beforeEach(() => {
  patch.mockReset();
  refresh.mockReset();
});

describe('SynthDetailsForm', () => {
  it('saves only once something changed, sending the year as a number', async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue({
      name: 'Model D',
      maker: 'Moog Music',
      year: 1971,
      heritage: SYNTH.heritage,
      summary: SYNTH.summary,
    });
    render(<SynthDetailsForm synth={SYNTH} />);

    const save = screen.getByRole('button', { name: 'Save details' });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText(/^Maker/, INPUT), ' Music');
    const year = screen.getByLabelText(/^Year/, INPUT);
    await user.clear(year);
    await user.type(year, '1971');
    await user.click(save);

    expect(patch).toHaveBeenCalledWith('/api/v1/admin/synths/model-d', {
      body: {
        name: 'Model D',
        maker: 'Moog Music',
        year: 1971,
        heritage: SYNTH.heritage,
        summary: SYNTH.summary,
      },
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    // The heading and title above the form are server-rendered, so the page re-renders with the new name.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(save).toBeDisabled();
  });

  it("sends a year that is not a number as written, and shows the server's problem on it", async () => {
    const user = userEvent.setup();
    patch.mockRejectedValue(
      new APIClientError('Invalid synth', 'VALIDATION_ERROR', 400, {
        errors: [
          { path: 'year', message: 'Expected a number' },
          { path: 'design', message: 'Not editable here' },
        ],
      })
    );
    render(<SynthDetailsForm synth={SYNTH} />);

    const year = screen.getByLabelText(/^Year/, INPUT);
    await user.clear(year);
    await user.type(year, 'early 70s');
    await user.click(screen.getByRole('button', { name: 'Save details' }));

    expect(patch.mock.calls[0][1]?.body).toMatchObject({ year: 'early 70s' });
    expect(await screen.findByText('Expected a number')).toBeInTheDocument();
    expect(year).toHaveAttribute('aria-invalid', 'true');
    expect(year).toHaveAttribute('aria-describedby', 'synth-year-problems');
    expect(screen.getByLabelText(/^Name/, INPUT)).toHaveAttribute('aria-invalid', 'false');
    // What no field claims is listed with the refusal.
    expect(screen.getByText('Invalid synth').closest('[role="alert"]')).toHaveTextContent(
      'Not editable here'
    );
  });

  it('says it could not save when the failure is not a refusal', async () => {
    const user = userEvent.setup();
    patch.mockRejectedValue(new Error('network'));
    render(<SynthDetailsForm synth={SYNTH} />);

    await user.type(screen.getByLabelText(/^Summary/, INPUT), '!');
    await user.click(screen.getByRole('button', { name: 'Save details' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the synth. Try again.'
    );
  });

  it('cannot save for an admin acting for another org', async () => {
    const user = userEvent.setup();
    render(
      <SharedSettingsAccessProvider readOnly canSwitch={false}>
        <SynthDetailsForm synth={SYNTH} />
      </SharedSettingsAccessProvider>
    );

    await user.type(screen.getByLabelText(/^Heritage/, INPUT), '!');

    expect(screen.getByRole('button', { name: 'Save details' })).toBeDisabled();
  });
});
