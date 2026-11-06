// @vitest-environment jsdom
// jsdom, as the links admin's own tests: happy-dom drops a native <select>'s value set by react-hook-form at register.

/**
 * The suggested links queue (`f-link-suggestions` t-186): each row, approve through the link form, decline with a
 * reason, a decided one's outcome; and the link editor naming who suggested a link.
 *
 * Pins: a row names its suggester and its target, linked to the target's editor (a removed one cannot be approved);
 * approve opens the form filled from the suggestion, with its address fixed, Read previewing through `/resolve`, and
 * saving accepts it through the t-185 decide route with the admin's kind and title; a refused accept says why and
 * stays open; decline needs a reason and sends it; a decided suggestion shows its outcome and no actions.
 *
 * @see components/app/admin/links/suggestion-queue.tsx
 * @see components/app/admin/links/link-form.tsx
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  readSuggestedLinks,
  type AdminLinkView,
  type SuggestedLinkView,
} from '@/components/app/admin/links/data';
import { LinkForm } from '@/components/app/admin/links/link-form';
import { LinkSuggestionQueue } from '@/components/app/admin/links/suggestion-queue';
import { apiClient, APIClientError } from '@/lib/api/client';

const mockRefresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}));
const mockReadOnly = vi.hoisted(() => vi.fn(() => false));
vi.mock('@/components/admin/shared-settings-access', () => ({
  useSharedSettingsReadOnly: () => mockReadOnly(),
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
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
/** A field by its label; the label also names its ⓘ button, so ask for the control. */
const INPUT = { selector: 'input, select, textarea' };
const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

function suggestion(over: Partial<SuggestedLinkView> = {}): SuggestedLinkView {
  return {
    id: 'lsug-1',
    target: { kind: 'instrument', id: 'moog-minimoog', name: 'Minimoog Model D' },
    url: VIDEO,
    kind: 'demo',
    title: 'Minimoog bass demo',
    note: 'The best one I know.',
    status: 'PENDING',
    linkId: null,
    reason: null,
    decidedAt: null,
    createdAt: '2026-11-06T09:00:00.000Z',
    suggestedBy: 'Dana Owner',
    ...over,
  };
}

function link(over: Partial<AdminLinkView> = {}): AdminLinkView {
  return {
    id: 'link-1',
    owner: { kind: 'instrument', id: 'moog-minimoog', name: 'Minimoog Model D' },
    url: VIDEO,
    provider: 'youtube',
    kind: 'demo',
    title: 'Minimoog bass demo',
    thumbnailUrl: null,
    ours: false,
    order: 0,
    rating: null,
    views: null,
    likes: null,
    statsAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    suggestedBy: null,
    ...over,
  };
}

const row = (title: string) => screen.getByRole('article', { name: new RegExp(title) });

beforeEach(() => {
  vi.clearAllMocks();
  mockReadOnly.mockReturnValue(false);
});

describe('readSuggestedLinks', () => {
  it('keeps the suggestions that read and drops any that do not', () => {
    const good = suggestion();
    expect(readSuggestedLinks([good, { ...good, id: 'bad', status: 'MERGED' }, null])).toEqual([
      good,
    ]);
    expect(readSuggestedLinks({ not: 'a list' })).toEqual([]);
  });
});

describe('LinkSuggestionQueue', () => {
  it('says so when there are none', () => {
    render(<LinkSuggestionQueue suggestions={[]} />);
    expect(screen.getByText('No suggestions here.')).toBeInTheDocument();
  });

  it('names the suggester and the target, linked to its editor', () => {
    render(
      <LinkSuggestionQueue
        suggestions={[
          suggestion(),
          suggestion({
            id: 'lsug-2',
            title: 'How the lead is made',
            target: { kind: 'sound', id: 'model-d/autobahn-lead', name: 'Autobahn lead' },
            suggestedBy: null,
          }),
        ]}
      />
    );
    const first = row('Minimoog bass demo');
    expect(first).toHaveTextContent('Pending · suggested by Dana Owner');
    expect(first).toHaveTextContent('The best one I know.');
    expect(within(first).getByRole('link', { name: 'Minimoog Model D' })).toHaveAttribute(
      'href',
      '/admin/synths/bank/instruments/moog-minimoog'
    );
    expect(within(first).getByRole('link', { name: VIDEO })).toHaveAttribute(
      'rel',
      'noopener noreferrer nofollow'
    );

    const second = row('How the lead is made');
    expect(second).toHaveTextContent('suggested by an erased account');
    expect(within(second).getByRole('link', { name: 'Autobahn lead' })).toHaveAttribute(
      'href',
      '/admin/synths/catalogue/model-d/sounds/autobahn-lead'
    );
  });

  it('cannot approve one whose target has been removed, only decline it', () => {
    render(
      <LinkSuggestionQueue
        suggestions={[suggestion({ target: { kind: 'song', id: 'gone-song', name: null } })]}
      />
    );
    const card = row('Minimoog bass demo');
    expect(card).toHaveTextContent('gone-song (since removed)');
    expect(within(card).getByRole('button', { name: 'Approve…' })).toBeDisabled();
    expect(within(card).getByRole('button', { name: 'Decline…' })).toBeEnabled();
  });

  it('decides nothing where shared settings are read-only', () => {
    mockReadOnly.mockReturnValue(true);
    render(<LinkSuggestionQueue suggestions={[suggestion()]} />);
    expect(screen.getByRole('button', { name: 'Approve…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decline…' })).toBeDisabled();
  });

  it('approves through the link form, filled from the suggestion, with the admin’s kind and title', async () => {
    const user = userEvent.setup();
    post.mockImplementation(async (url: string) =>
      url.endsWith('/resolve')
        ? {
            url: VIDEO,
            provider: 'youtube',
            title: 'Minimoog Model D demo (official)',
            thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          }
        : { id: 'lsug-1', status: 'ACCEPTED', linkId: 'link-9', reason: null }
    );
    render(<LinkSuggestionQueue suggestions={[suggestion()]} />);
    await user.click(screen.getByRole('button', { name: 'Approve…' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Minimoog Model D')).toBeInTheDocument();
    const address = within(dialog).getByLabelText('Address', INPUT);
    expect(address).toHaveValue(VIDEO);
    expect(address).toHaveAttribute('readonly');
    expect(within(dialog).getByLabelText('Title', INPUT)).toHaveValue('Minimoog bass demo');
    // An accepted link is never ours: neither Ours nor Rating is offered.
    expect(within(dialog).queryByLabelText('Rating', INPUT)).toBeNull();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Read' }));
    expect(post).toHaveBeenCalledWith('/api/v1/admin/links/resolve', { body: { url: VIDEO } });
    expect(await within(dialog).findByTestId('link-preview')).toHaveTextContent('YouTube');

    await user.selectOptions(within(dialog).getByLabelText('Kind', INPUT), 'review');
    await user.clear(within(dialog).getByLabelText('Title', INPUT));
    await user.type(within(dialog).getByLabelText('Title', INPUT), 'A fair review');
    await user.click(within(dialog).getByRole('button', { name: 'Accept and add' }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(post).toHaveBeenLastCalledWith('/api/v1/admin/links/suggestions/lsug-1', {
      body: { action: 'accept', kind: 'review', title: 'A fair review' },
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('leaves the title to the server when the admin empties it', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ id: 'lsug-1', status: 'ACCEPTED', linkId: 'link-9', reason: null });
    render(<LinkSuggestionQueue suggestions={[suggestion({ title: null })]} />);
    await user.click(screen.getByRole('button', { name: 'Approve…' }));
    await user.click(await screen.findByRole('button', { name: 'Accept and add' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/api/v1/admin/links/suggestions/lsug-1', {
      body: { action: 'accept', kind: 'demo' },
    });
  });

  it('says why an accept was refused, and stays open', async () => {
    const user = userEvent.setup();
    post.mockRejectedValue(
      new APIClientError('That link is already on this owner', 'CONFLICT', 409)
    );
    render(<LinkSuggestionQueue suggestions={[suggestion()]} />);
    await user.click(screen.getByRole('button', { name: 'Approve…' }));
    await user.click(await screen.findByRole('button', { name: 'Accept and add' }));

    expect(await screen.findByText('That link is already on this owner')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('puts a refused title on the title field', async () => {
    const user = userEvent.setup();
    const problem = 'Its title could not be read from the link: give it one';
    post.mockRejectedValue(
      new APIClientError(problem, 'VALIDATION_ERROR', 400, { title: problem })
    );
    render(<LinkSuggestionQueue suggestions={[suggestion({ title: null })]} />);
    await user.click(screen.getByRole('button', { name: 'Approve…' }));
    await user.click(await screen.findByRole('button', { name: 'Accept and add' }));

    expect(await screen.findByText(problem)).toBeInTheDocument();
    expect(screen.getByLabelText('Title', INPUT)).toHaveAttribute('aria-invalid', 'true');
  });

  it('declines with a reason, and needs one', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ id: 'lsug-1', status: 'DECLINED', linkId: null, reason: 'x' });
    render(<LinkSuggestionQueue suggestions={[suggestion()]} />);
    await user.click(screen.getByRole('button', { name: 'Decline…' }));
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    expect(await screen.findByText('Say why it is declined')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Reason', INPUT), '  Not about this synth ');
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/api/v1/admin/links/suggestions/lsug-1', {
      body: { action: 'decline', reason: 'Not about this synth' },
    });
  });

  it('shows a decline the server refused', async () => {
    const user = userEvent.setup();
    post.mockRejectedValue(
      new APIClientError('This suggestion has already been decided (accepted)', 'CONFLICT', 409)
    );
    render(<LinkSuggestionQueue suggestions={[suggestion()]} />);
    await user.click(screen.getByRole('button', { name: 'Decline…' }));
    await user.type(screen.getByLabelText('Reason', INPUT), 'Duplicate');
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    expect(
      await screen.findByText('This suggestion has already been decided (accepted)')
    ).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('shows a decided suggestion’s outcome, and nothing to decide', () => {
    render(
      <LinkSuggestionQueue
        suggestions={[
          suggestion({ status: 'ACCEPTED', linkId: 'link-9' }),
          suggestion({
            id: 'lsug-2',
            title: 'Wrong synth',
            status: 'DECLINED',
            reason: 'That is a Prophet-5',
          }),
        ]}
      />
    );
    const accepted = row('Minimoog bass demo');
    expect(accepted).toHaveTextContent('Accepted · suggested by Dana Owner');
    expect(accepted).toHaveTextContent('Added to Minimoog Model D');
    expect(row('Wrong synth')).toHaveTextContent('Declined: That is a Prophet-5');
    expect(screen.queryByRole('button', { name: /Approve|Decline/ })).toBeNull();
  });
});

describe('LinkForm — who suggested it', () => {
  it('names the suggester of a link that came from a suggestion', () => {
    render(<LinkForm link={link({ suggestedBy: { name: 'Dana Owner' } })} onSaved={vi.fn()} />);
    expect(screen.getByText('Suggested by Dana Owner')).toBeInTheDocument();
  });

  it('says so when the suggester’s account has been erased', () => {
    render(<LinkForm link={link({ suggestedBy: { name: null } })} onSaved={vi.fn()} />);
    expect(screen.getByText('Suggested by an erased account')).toBeInTheDocument();
  });

  it('says nothing of a link an admin added', () => {
    render(<LinkForm link={link()} onSaved={vi.fn()} />);
    expect(screen.queryByText(/Suggested by/)).toBeNull();
  });
});
