// @vitest-environment happy-dom

/**
 * Admin control on the pattern admin pages (`f-pattern-library` t-156): the provenance panel, the rights-risk and
 * status form it and the list's bulk bar share, and the comment form.
 *
 * - the panel shows origin and who made it, Inspired by, fidelity, sources, a batch's research and listen, rights risk
 *   and status with their reasons, comments and history;
 * - a change is sent with its reason; a disable that would leave a patch with nothing asks first, and Disable anyway
 *   sends it again acknowledged;
 * - the bulk bar sends the ticked rows, and says so when none is;
 * - a comment is posted and the page refreshed.
 *
 * @see components/app/admin/patterns/provenance-panel.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ProvenancePanel } from '@/components/app/admin/patterns/provenance-panel';
import { PATTERN_PICK, PatternBulkBar } from '@/components/app/admin/patterns/pattern-bulk-bar';
import { APIClientError, apiClient } from '@/lib/api/client';
import { adminLibraryPattern } from '@/tests/helpers/admin-library-pattern';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiClient: { post: vi.fn() },
}));

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const post = vi.mocked(apiClient.post);
const ID = 'cpat000000000000000000001';
const CONTROL = '/api/v1/admin/library-patterns/control';
const RESULT = { changed: [ID], soundsRewritten: ['model-d/funk-bass'], leftWithout: [] };

const researched = adminLibraryPattern({
  fidelity: 'reconstructed',
  sources: [
    {
      type: 'by_ear',
      citation: 'The 12" single',
      url: 'https://example.com/single',
      checkedAt: '2026-10-30',
    },
  ],
  madeBy: 'Claude (t-128)',
  madeAt: '2026-10-31T00:00:00.000Z',
  research: {
    task: 't-128',
    work: 'The Model',
    part: 'The bass, four bars',
    notes: 'Down an octave.',
    listenedAt: null,
  },
  rightsRisk: 'needs_review',
  rightsReason: null,
});

beforeEach(() => {
  post.mockReset();
  refresh.mockReset();
});

describe('ProvenancePanel', () => {
  it('shows where the pattern came from, its rights risk and status, comments and history', () => {
    render(
      <ProvenancePanel
        pattern={researched}
        comments={[
          {
            id: 'k1',
            body: 'Heard it: fine.',
            author: null,
            createdAt: '2026-11-01T09:30:00.000Z',
          },
        ]}
        history={[
          {
            id: 'a1',
            action: 'library_pattern.control',
            by: 'Jo',
            at: '2026-11-01T10:00:00.000Z',
            changes: { status: { from: 'enabled', to: 'disabled' } },
          },
        ]}
      />
    );
    const panel = screen.getByRole('region', { name: /Provenance/ });
    for (const text of [
      'AI-generated · made by Claude (t-128) · 31 Oct 2026',
      'Minimoog Model D · Reconstructed',
      'By ear: The 12" single',
      't-128 · The Model · The bass, four bars',
      'Down an octave.',
      'Not yet',
      'the default for its fidelity, until an admin sets one',
      'A deleted account · 1 Nov 2026, 09:30 UTC',
      'Heard it: fine.',
      'Rights risk or status',
      'status: enabled → disabled',
    ])
      expect(panel).toHaveTextContent(text);
    expect(within(panel).getByRole('link', { name: 'link' })).toHaveAttribute(
      'href',
      'https://example.com/single'
    );
  });

  it('says so when the comments or history could not be read, and when there are none', () => {
    const { unmount } = render(
      <ProvenancePanel pattern={adminLibraryPattern()} comments={null} history={null} />
    );
    expect(screen.getByText(/comments could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText(/history could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText('Not from a research batch')).toBeInTheDocument();
    unmount();
    render(<ProvenancePanel pattern={adminLibraryPattern()} comments={[]} history={[]} />);
    expect(screen.getByText('No comments yet.')).toBeInTheDocument();
    expect(screen.getByText(/No admin has changed it/)).toBeInTheDocument();
  });

  it('sends a rights risk with its reason, and refreshes', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue(RESULT);
    render(<ProvenancePanel pattern={researched} comments={[]} history={[]} />);

    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: /^Rights risk/ }), 'cleared');
    expect(apply).toBeDisabled(); // no reason yet
    await user.type(screen.getByRole('textbox', { name: /^Reason/ }), 'Four bars, labelled');
    await user.click(apply);

    expect(post).toHaveBeenCalledWith(CONTROL, {
      body: { ids: [ID], rightsRisk: 'cleared', reason: 'Four bars, labelled', acknowledge: false },
    });
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved the change. 1 patch now plays the next enabled pattern.'
    );
  });

  it('will not offer to enable a blocked pattern', async () => {
    const user = userEvent.setup();
    render(<ProvenancePanel pattern={researched} comments={[]} history={[]} />);
    await user.selectOptions(screen.getByRole('combobox', { name: /^Rights risk/ }), 'blocked');
    await user.selectOptions(screen.getByRole('combobox', { name: /^Status/ }), 'enabled');
    await user.type(screen.getByRole('textbox', { name: /^Reason/ }), 'x');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(screen.getByText('A blocked pattern is always disabled.')).toBeInTheDocument();
  });

  it('asks before leaving a patch with nothing to play, then sends it acknowledged', async () => {
    const user = userEvent.setup();
    post.mockRejectedValueOnce(
      new APIClientError(
        'This would leave a patch with no enabled pattern to play',
        'VALIDATION_ERROR',
        400,
        {
          errors: [
            { path: 'acknowledge', message: 'Funk bass (model-d) would have no enabled pattern' },
          ],
        }
      )
    );
    post.mockResolvedValueOnce({
      changed: [ID],
      soundsRewritten: [],
      leftWithout: [{ synthId: 'model-d', slug: 'funk-bass', name: 'Funk bass' }],
    });
    render(<ProvenancePanel pattern={researched} comments={[]} history={[]} />);

    await user.selectOptions(screen.getByRole('combobox', { name: /^Status/ }), 'disabled');
    await user.type(screen.getByRole('textbox', { name: /^Reason/ }), 'Under review');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent('Funk bass (model-d) would have no enabled pattern');
    expect(refresh).not.toHaveBeenCalled();
    await user.click(within(warning).getByRole('button', { name: 'Disable anyway' }));

    expect(post).toHaveBeenLastCalledWith(CONTROL, {
      body: { ids: [ID], status: 'disabled', reason: 'Under review', acknowledge: true },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      '1 patch has no enabled pattern and keeps its riff.'
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('cancels the held change, and shows any other refusal', async () => {
    const user = userEvent.setup();
    post.mockRejectedValueOnce(
      new APIClientError('Held', 'VALIDATION_ERROR', 400, {
        errors: [{ path: 'acknowledge', message: 'Funk bass would have none' }],
      })
    );
    post.mockRejectedValueOnce(new Error('network'));
    render(<ProvenancePanel pattern={researched} comments={[]} history={[]} />);
    await user.selectOptions(screen.getByRole('combobox', { name: /^Status/ }), 'disabled');
    await user.type(screen.getByRole('textbox', { name: /^Reason/ }), 'x');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alert')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The change could not be saved');
  });

  it('posts a comment, and refreshes', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({});
    render(<ProvenancePanel pattern={researched} comments={[]} history={[]} />);
    const send = screen.getByRole('button', { name: 'Comment' });
    expect(send).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /^Add a comment/ }), '  Heard it.  ');
    await user.click(send);
    expect(post).toHaveBeenCalledWith(`/api/v1/admin/library-patterns/${ID}/comments`, {
      body: { body: 'Heard it.' },
    });
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: /^Add a comment/ })).toHaveValue('');
  });

  it('shows a refused comment', async () => {
    const user = userEvent.setup();
    post.mockRejectedValue(new Error('down'));
    render(<ProvenancePanel pattern={researched} comments={[]} history={[]} />);
    await user.type(screen.getByRole('textbox', { name: /^Add a comment/ }), 'x');
    await user.click(screen.getByRole('button', { name: 'Comment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The comment could not be saved');
  });
});

describe('PatternBulkBar', () => {
  function withRows(...ids: string[]) {
    return (
      <>
        <PatternBulkBar />
        {ids.map((id) => (
          <input
            key={id}
            type="checkbox"
            name={PATTERN_PICK}
            value={id}
            aria-label={`Choose ${id}`}
          />
        ))}
      </>
    );
  }

  it('sends the ticked rows with one reason, and ticks all on the page', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ changed: ['a', 'c'], soundsRewritten: [], leftWithout: [] });
    render(withRows('a', 'b', 'c'));

    await user.click(screen.getByRole('checkbox', { name: 'Choose a' }));
    await user.click(screen.getByRole('checkbox', { name: 'Choose c' }));
    await user.selectOptions(screen.getByRole('combobox', { name: /^Status/ }), 'disabled');
    await user.type(screen.getByRole('textbox', { name: /^Reason/ }), 'Batch review');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(post).toHaveBeenCalledWith(CONTROL, {
      body: { ids: ['a', 'c'], status: 'disabled', reason: 'Batch review', acknowledge: false },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Saved 2 changes.');

    await user.click(screen.getByRole('checkbox', { name: 'All on this page' }));
    for (const id of ['a', 'b', 'c'])
      expect(screen.getByRole('checkbox', { name: `Choose ${id}` })).toBeChecked();
  });

  it('says to tick one when none is, sending nothing', async () => {
    const user = userEvent.setup();
    render(withRows('a'));
    await user.selectOptions(screen.getByRole('combobox', { name: /^Rights risk/ }), 'cleared');
    await user.type(screen.getByRole('textbox', { name: /^Reason/ }), 'x');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('Tick at least one pattern in the list.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('says when nothing changed', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ changed: [], soundsRewritten: [], leftWithout: [] });
    render(withRows('a'));
    await user.click(screen.getByRole('checkbox', { name: 'Choose a' }));
    await user.selectOptions(screen.getByRole('combobox', { name: /^Status/ }), 'enabled');
    await user.type(screen.getByRole('textbox', { name: /^Reason/ }), 'x');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Nothing changed');
  });
});
