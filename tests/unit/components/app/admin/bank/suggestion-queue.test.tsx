// @vitest-environment happy-dom

/**
 * SuggestionQueue (`f-databank` t-37): each pending suggestion is accepted, merged or declined with
 * `POST /api/v1/admin/bank/suggestions/[id]`; a refusal shows what the server named; a decided one shows its outcome.
 *
 * @see components/app/admin/bank/suggestion-queue.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SuggestionQueue, slugify } from '@/components/app/admin/bank/suggestion-queue';
import { apiClient, APIClientError } from '@/lib/api/client';
import type { AdminSuggestion } from '@/lib/app/bank/suggestion-data';

const mockRefresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

vi.mock('@/lib/api/client', () => ({
  apiClient: { post: vi.fn() },
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

const post = vi.mocked(apiClient.post);
const INPUT = { selector: 'input, textarea, select' };

const PENDING: AdminSuggestion = {
  id: 'sug-1',
  name: 'Prophet-5 Rev4',
  maker: 'Sequential',
  link: 'https://sequential.com/prophet-5',
  note: 'The 2020 reissue.',
  status: 'PENDING',
  instrumentId: null,
  reason: null,
  decidedAt: null,
  createdAt: '2026-10-14T10:00:00.000Z',
  suggestedBy: 'Dana Owner',
};

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({});
});

describe('slugify', () => {
  it('makes a databank id from free text', () => {
    expect(slugify('Sequential Prophet-5 Rev4')).toBe('sequential-prophet-5-rev4');
    expect(slugify('  Élektron  Analog Four! ')).toBe('elektron-analog-four');
  });
});

describe('SuggestionQueue', () => {
  it('says so when there are none', () => {
    render(<SuggestionQueue suggestions={[]} />);
    expect(screen.getByText('No suggestions here.')).toBeInTheDocument();
  });

  it('shows what was suggested, by whom, and an erased suggester as such', () => {
    render(
      <SuggestionQueue suggestions={[PENDING, { ...PENDING, id: 'sug-2', suggestedBy: null }]} />
    );
    expect(screen.getAllByText(/Prophet-5 Rev4/)).toHaveLength(2);
    expect(screen.getByText(/suggested by Dana Owner/)).toBeInTheDocument();
    expect(screen.getByText(/suggested by an erased account/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: PENDING.link! })[0]).toHaveAttribute(
      'rel',
      'noopener noreferrer nofollow'
    );
  });

  it('accepts with the instrument prefilled from the suggestion, then refreshes', async () => {
    const user = userEvent.setup();
    render(<SuggestionQueue suggestions={[PENDING]} />);
    await user.click(screen.getByRole('button', { name: 'Accept…' }));

    expect(screen.getByLabelText(/^Id/, INPUT)).toHaveValue('sequential-prophet-5-rev4');
    expect(screen.getByLabelText(/^Name/, INPUT)).toHaveValue('Prophet-5 Rev4');
    expect(screen.getByLabelText(/^Source/, INPUT)).toHaveValue(PENDING.link);
    await user.type(screen.getByLabelText(/^Year/, INPUT), '2020');
    await user.selectOptions(screen.getByLabelText(/^Kind/, INPUT), 'poly');
    await user.type(screen.getByLabelText(/^Text/, INPUT), 'A reissue.');
    await user.click(screen.getByRole('button', { name: 'Add instrument' }));

    expect(post).toHaveBeenCalledWith('/api/v1/admin/bank/suggestions/sug-1', {
      body: {
        action: 'accept',
        instrument: {
          id: 'sequential-prophet-5-rev4',
          name: 'Prophet-5 Rev4',
          maker: 'Sequential',
          year: '2020',
          kind: 'poly',
          text: 'A reissue.',
          source: PENDING.link,
        },
      },
    });
    expect(mockRefresh).toHaveBeenCalled();
    // Until the refresh replaces the form with the outcome, it cannot be sent again.
    expect(screen.getByRole('button', { name: /Add instrument|Saving/ })).toBeDisabled();
  });

  it('sends no source when the admin clears it, as the databank has none', async () => {
    const user = userEvent.setup();
    render(<SuggestionQueue suggestions={[PENDING]} />);
    await user.click(screen.getByRole('button', { name: 'Accept…' }));
    await user.clear(screen.getByLabelText(/^Source/, INPUT));
    await user.click(screen.getByRole('button', { name: 'Add instrument' }));

    const [, { body }] = post.mock.calls[0] as [string, { body: { instrument: object } }];
    expect(body.instrument).not.toHaveProperty('source');
  });

  it('shows a refused accept on the field the server named, and does not refresh', async () => {
    post.mockRejectedValue(
      new APIClientError('Validation failed', 'VALIDATION_ERROR', 400, {
        errors: [
          { path: 'instrument.year', message: 'Too small: expected string to have >=1 characters' },
        ],
      })
    );
    const user = userEvent.setup();
    render(<SuggestionQueue suggestions={[PENDING]} />);
    await user.click(screen.getByRole('button', { name: 'Accept…' }));
    await user.click(screen.getByRole('button', { name: 'Add instrument' }));

    expect(await screen.findByText(/expected string to have >=1 characters/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Year/, INPUT)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Validation failed')).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add instrument' })).toBeEnabled();
  });

  it('merges into the instrument id typed', async () => {
    const user = userEvent.setup();
    render(<SuggestionQueue suggestions={[PENDING]} />);
    await user.click(screen.getByRole('button', { name: 'Merge…' }));
    await user.type(screen.getByLabelText(/^Instrument id/, INPUT), ' sequential-prophet-5 ');
    await user.click(screen.getByRole('button', { name: 'Merge' }));

    expect(post).toHaveBeenCalledWith('/api/v1/admin/bank/suggestions/sug-1', {
      body: { action: 'merge', instrumentId: 'sequential-prophet-5' },
    });
  });

  it('declines with the reason, and Cancel goes back to the three actions', async () => {
    const user = userEvent.setup();
    render(<SuggestionQueue suggestions={[PENDING]} />);
    await user.click(screen.getByRole('button', { name: 'Decline…' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Accept…' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Decline…' }));
    await user.type(screen.getByLabelText(/^Reason/, INPUT), 'A drum machine');
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    expect(post).toHaveBeenCalledWith('/api/v1/admin/bank/suggestions/sug-1', {
      body: { action: 'decline', reason: 'A drum machine' },
    });
  });

  it('shows a decided suggestion’s outcome and offers no actions', () => {
    render(
      <SuggestionQueue
        suggestions={[
          { ...PENDING, status: 'ACCEPTED', instrumentId: 'sequential-prophet-5-rev4' },
          { ...PENDING, id: 'sug-2', status: 'MERGED', instrumentId: 'sequential-prophet-5' },
          { ...PENDING, id: 'sug-3', status: 'DECLINED', reason: 'Duplicate' },
        ]}
      />
    );
    expect(screen.queryByRole('button', { name: 'Accept…' })).toBeNull();
    expect(screen.getByRole('link', { name: 'sequential-prophet-5-rev4' })).toHaveAttribute(
      'href',
      '/admin/synths/bank/instruments/sequential-prophet-5-rev4'
    );
    expect(screen.getByText(/Already in the databank as/)).toBeInTheDocument();
    expect(screen.getByText('Declined: Duplicate')).toBeInTheDocument();
  });
});
