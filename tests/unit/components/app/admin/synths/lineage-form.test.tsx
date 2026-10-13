// @vitest-environment happy-dom

/**
 * LineageForm (`f-catalogue-admin` t-31): a synth's history section, saved whole through
 * `PUT /api/v1/admin/synths/[id]/lineage`.
 *
 * @see components/app/admin/synths/lineage-form.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LineageForm } from '@/components/app/admin/synths/lineage-form';
import { apiClient, APIClientError } from '@/lib/api/client';
import { adminSynthDetail } from '@/tests/helpers/admin-synth-detail';

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
const LINEAGE = adminSynthDetail().lineage!;
const PATH = '/api/v1/admin/synths/model-d/lineage';
/** A field by its label; the label also names its ⓘ button, so ask for the input. */
const INPUT = { selector: 'input, textarea' };

const sentBody = () => put.mock.calls[0][1]?.body as Record<string, unknown>;

beforeEach(() => {
  put.mockReset();
});

describe('LineageForm', () => {
  it('saves the section whole, leaving out an empty tag and note, one player per line', async () => {
    const user = userEvent.setup();
    put.mockResolvedValue({ ...LINEAGE, users: ['Bernie Worrell', 'Jan Hammer'] });
    render(<LineageForm synthId="model-d" lineage={LINEAGE} />);

    await user.clear(screen.getByLabelText('Tag', INPUT));
    await user.type(screen.getByLabelText(/^Players/, INPUT), '\n  Jan Hammer  \n\n');
    await user.click(screen.getByRole('button', { name: 'Save history' }));

    expect(put).toHaveBeenCalledWith(PATH, {
      body: {
        title: LINEAGE.title,
        intro: LINEAGE.intro,
        timeline: [{ year: '1964', name: 'Moog modular', text: 'Patch cords.' }],
        relatives: [{ name: 'ARP Odyssey', years: '1972–81', text: 'The rival.' }],
        users: ['Bernie Worrell', 'Jan Hammer'],
      },
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('adds, moves and removes timeline entries and relatives, and sends a note', async () => {
    const user = userEvent.setup();
    put.mockResolvedValue(LINEAGE);
    render(<LineageForm synthId="model-d" lineage={LINEAGE} />);

    await user.click(screen.getByRole('button', { name: 'Add a timeline entry' }));
    const years = screen.getAllByLabelText('Year', INPUT);
    await user.type(years[1], '1970');
    await user.click(screen.getByRole('button', { name: 'Move timeline entry 2 up' }));
    await user.click(screen.getByRole('button', { name: 'Remove relative' }));
    await user.click(screen.getByRole('button', { name: 'Add a relative' }));
    await user.type(screen.getByLabelText('Years', INPUT), '1978');
    await user.type(screen.getByLabelText(/^Note/, INPUT), 'Partial list.');
    await user.click(screen.getByRole('button', { name: 'Save history' }));

    const body = sentBody();
    expect(body.timeline).toEqual([
      { year: '1970', name: '', text: '' },
      { year: '1964', name: 'Moog modular', tag: 'The ancestor', text: 'Patch cords.' },
    ]);
    expect(body.relatives).toEqual([{ name: '', years: '1978', text: '' }]);
    expect(body.note).toBe('Partial list.');
  });

  it('removes a timeline entry', async () => {
    const user = userEvent.setup();
    put.mockResolvedValue(LINEAGE);
    render(<LineageForm synthId="model-d" lineage={LINEAGE} />);

    await user.click(screen.getByRole('button', { name: 'Remove entry' }));
    await user.click(screen.getByRole('button', { name: 'Save history' }));

    expect(sentBody().timeline).toEqual([]);
  });

  it('offers to create the section for a synth that has none, and then saves it', async () => {
    const user = userEvent.setup();
    put.mockResolvedValue({ ...LINEAGE, title: 'History' });
    render(<LineageForm synthId="model-d" lineage={null} />);

    expect(screen.getByText(/has no history section yet/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Title/, INPUT), 'History');
    await user.click(screen.getByRole('button', { name: 'Create history section' }));

    expect(sentBody()).toEqual({
      title: 'History',
      intro: '',
      timeline: [],
      relatives: [],
      users: [],
    });
    expect(await screen.findByRole('button', { name: 'Save history' })).toBeInTheDocument();
    expect(screen.queryByText(/has no history section yet/)).not.toBeInTheDocument();
  });

  it("puts the server's problems on the entry and field they name", async () => {
    const user = userEvent.setup();
    put.mockRejectedValue(
      new APIClientError('Invalid history section', 'VALIDATION_ERROR', 400, {
        errors: [
          { path: 'timeline.0.text', message: 'Required' },
          { path: 'relatives', message: 'Too many relatives' },
        ],
      })
    );
    render(<LineageForm synthId="model-d" lineage={LINEAGE} />);

    await user.click(screen.getByRole('button', { name: 'Save history' }));

    const text = screen.getAllByLabelText('Text', INPUT)[0];
    expect(await screen.findByText('Required')).toBeInTheDocument();
    expect(text).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Too many relatives')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Text', INPUT)[1]).toHaveAttribute('aria-invalid', 'false');
  });

  it('says it could not save when the failure is not a refusal', async () => {
    const user = userEvent.setup();
    put.mockRejectedValue(new Error('network'));
    render(<LineageForm synthId="model-d" lineage={LINEAGE} />);

    await user.click(screen.getByRole('button', { name: 'Save history' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the history section. Try again.'
    );
  });

  it('refuses to show a stored section in a shape it cannot read', () => {
    render(<LineageForm synthId="model-d" lineage={{ ...LINEAGE, timeline: { not: 'a list' } }} />);

    expect(screen.getByRole('alert')).toHaveTextContent('cannot be edited here');
    expect(screen.queryByRole('button', { name: /history/ })).not.toBeInTheDocument();
  });

  it('labels every relative row by its place', () => {
    render(<LineageForm synthId="model-d" lineage={LINEAGE} />);
    const relatives = screen.getByRole('group', { name: /Relatives/ });
    expect(within(relatives).getByRole('button', { name: 'Move relative 1 up' })).toBeDisabled();
  });
});
