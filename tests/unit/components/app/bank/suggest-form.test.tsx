// @vitest-environment happy-dom

/**
 * SuggestForm (`f-databank` t-37): on the databank's Instruments tab. Signed out, it offers sign-in back to the tab;
 * signed in, it checks with the route's schema and sends `POST /api/v1/bank/suggestions`.
 *
 * @see components/app/bank/suggest-form.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SuggestForm } from '@/components/app/bank/suggest-form';
import { apiClient, APIClientError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/client';

vi.mock('@/lib/auth/client', () => ({ useSession: vi.fn() }));

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
const session = vi.mocked(useSession);
const INPUT = { selector: 'input, textarea' };

function signedIn() {
  session.mockReturnValue({
    data: { user: { id: 'user-1' }, session: {} },
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useSession>);
}

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({});
  signedIn();
});

async function openForm() {
  const user = userEvent.setup();
  render(<SuggestForm />);
  await user.click(screen.getByRole('button', { name: 'Suggest a synth' }));
  return user;
}

describe('SuggestForm', () => {
  it('offers a signed-out visitor sign-in that returns to the Instruments tab', () => {
    session.mockReturnValue({ data: null, isPending: false, error: null });
    render(<SuggestForm />);
    expect(screen.getByRole('link', { name: 'Sign in to suggest it' })).toHaveAttribute(
      'href',
      '/login?callbackUrl=%2Fbank%2Finstruments'
    );
    expect(screen.queryByRole('button', { name: 'Suggest a synth' })).toBeNull();
  });

  it('renders nothing while the session is loading', () => {
    session.mockReturnValue({ data: null, isPending: true, error: null });
    const { container } = render(<SuggestForm />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sends the suggestion, leaving out empty optional fields, and thanks them', async () => {
    const user = await openForm();
    await user.type(screen.getByLabelText(/^Name/, INPUT), 'Prophet-5 Rev4');
    await user.type(screen.getByLabelText(/^Company/, INPUT), 'Sequential');
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }));

    expect(post).toHaveBeenCalledWith('/api/v1/bank/suggestions', {
      body: { name: 'Prophet-5 Rev4', maker: 'Sequential' },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Thanks: Prophet-5 Rev4');

    await user.click(screen.getByRole('button', { name: 'Suggest another' }));
    expect(screen.getByLabelText(/^Name/, INPUT)).toHaveValue('');
  });

  it('shows what is wrong before sending anything', async () => {
    const user = await openForm();
    await user.type(screen.getByLabelText(/^Link/, INPUT), 'not a link');
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }));

    expect(screen.getByText('Name the synth')).toBeInTheDocument();
    expect(screen.getByText('Name the company that made it')).toBeInTheDocument();
    expect(screen.getByText(/must be a web address/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/, INPUT)).toHaveAttribute('aria-invalid', 'true');
    expect(post).not.toHaveBeenCalled();
  });

  it('says when they have sent too many, and keeps what they typed', async () => {
    post.mockRejectedValue(new APIClientError('Too many requests', 'RATE_LIMIT_EXCEEDED', 429));
    const user = await openForm();
    await user.type(screen.getByLabelText(/^Name/, INPUT), 'MS-20');
    await user.type(screen.getByLabelText(/^Company/, INPUT), 'Korg');
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/a lot of suggestions/);
    expect(screen.getByLabelText(/^Name/, INPUT)).toHaveValue('MS-20');
  });

  it('says when sending failed for another reason', async () => {
    post.mockRejectedValue(new Error('network'));
    const user = await openForm();
    await user.type(screen.getByLabelText(/^Name/, INPUT), 'MS-20');
    await user.type(screen.getByLabelText(/^Company/, INPUT), 'Korg');
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be sent');
  });
});
