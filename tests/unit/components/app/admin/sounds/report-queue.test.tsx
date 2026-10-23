// @vitest-environment happy-dom

/**
 * ReportQueue (`f-sharing` h4): each reported sound is unlisted or its reports dismissed, and each unlisted one restored,
 * with `POST /api/v1/admin/sounds/[id]`; a refusal shows the server's words; the owner is named, a reporter never.
 *
 * @see components/app/admin/sounds/report-queue.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ReportQueue } from '@/components/app/admin/sounds/report-queue';
import { apiClient, APIClientError } from '@/lib/api/client';
import type { QueueSound } from '@/lib/app/sounds/report-data';

const mockRefresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

vi.mock('@/lib/api/client', () => ({
  apiClient: { post: vi.fn() },
  APIClientError: class APIClientError extends Error {
    constructor(
      message: string,
      public code?: string,
      public status?: number
    ) {
      super(message);
    }
  },
}));

const post = vi.mocked(apiClient.post);

const REPORTED: QueueSound = {
  id: 'snd1',
  synthId: 'model-d',
  synthName: 'Model D',
  name: 'Rude bass',
  notes: 'Some notes',
  visibility: 'published',
  slug: 'abcdefghjk',
  owner: 'patchwork',
  unlistedAt: null,
  reports: [
    {
      reason: 'offensive',
      note: 'The name',
      status: 'open',
      createdAt: '2026-10-17T10:00:00.000Z',
    },
    { reason: 'spam', note: null, status: 'open', createdAt: '2026-10-17T11:00:00.000Z' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({});
});

describe('ReportQueue', () => {
  it('says when there is nothing to act on', () => {
    render(<ReportQueue sounds={[]} />);
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
  });

  it('shows the sound, its owner, its page and each report by reason', () => {
    render(<ReportQueue sounds={[REPORTED]} />);
    expect(screen.getByRole('link', { name: 'Rude bass' })).toHaveAttribute(
      'href',
      '/synths/model-d/s/abcdefghjk'
    );
    expect(screen.getByText(/by @patchwork · published/)).toBeInTheDocument();
    const reports = screen.getByRole('list', { name: 'Reports' });
    expect(reports).toHaveTextContent('Offensive or hateful');
    expect(reports).toHaveTextContent('The name');
    expect(reports).toHaveTextContent('Spam');
  });

  it('unlists, then refreshes and stays busy so it cannot be sent twice', async () => {
    render(<ReportQueue sounds={[REPORTED]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Unlist' }));
    expect(post).toHaveBeenCalledWith('/api/v1/admin/sounds/snd1', { body: { action: 'unlist' } });
    expect(mockRefresh).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Unlisting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dismiss 2 reports' })).toBeDisabled();
  });

  it('dismisses the open reports', async () => {
    render(<ReportQueue sounds={[REPORTED]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss 2 reports' }));
    expect(post).toHaveBeenCalledWith('/api/v1/admin/sounds/snd1', { body: { action: 'dismiss' } });
  });

  it('offers Restore, and no page link or Dismiss, on an unlisted sound with no open reports', async () => {
    render(
      <ReportQueue
        sounds={[
          {
            ...REPORTED,
            owner: null,
            unlistedAt: '2026-10-17T12:00:00.000Z',
            reports: [{ ...REPORTED.reports[0], status: 'actioned' }],
          },
        ]}
      />
    );
    expect(screen.queryByRole('link', { name: 'Rude bass' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dismiss/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlist' })).not.toBeInTheDocument();
    expect(screen.getByText(/an owner with no username/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(post).toHaveBeenCalledWith('/api/v1/admin/sounds/snd1', { body: { action: 'restore' } });
  });

  it("shows a refusal in the server's words and lets the admin try again", async () => {
    post.mockRejectedValueOnce(
      new APIClientError('This patch is already unlisted', 'CONFLICT', 409)
    );
    render(<ReportQueue sounds={[REPORTED]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Unlist' }));
    expect(screen.getByRole('alert')).toHaveTextContent('This patch is already unlisted');
    expect(screen.getByRole('button', { name: 'Unlist' })).toBeEnabled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
