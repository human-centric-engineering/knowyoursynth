// @vitest-environment jsdom
// jsdom, not happy-dom: happy-dom drops a native <select>'s value set by react-hook-form at register, so an edit
// would read as having no rating there while a browser keeps it.

/**
 * The links admin (`f-videos-and-links` t-181): the add/edit form, the remove confirmation, the owner panel and its
 * reorder, and the list's filters.
 *
 * @see components/app/admin/links/link-form.tsx
 * @see components/app/admin/links/link-dialogs.tsx
 * @see components/app/admin/links/links-panel.tsx
 * @see components/app/admin/links/links-table.tsx
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  formatCount,
  ownerAdminPath,
  readLinks,
  type AdminLinkView,
} from '@/components/app/admin/links/data';
import { LinkForm } from '@/components/app/admin/links/link-form';
import { LinksPanel } from '@/components/app/admin/links/links-panel';
import { LinksTable } from '@/components/app/admin/links/links-table';
import { apiClient, APIClientError } from '@/lib/api/client';

const mockPush = vi.hoisted(() => vi.fn());
const mockRefresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  usePathname: () => '/admin/synths/links',
  useSearchParams: () => new URLSearchParams('provider=youtube&page=2'),
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);
const put = vi.mocked(apiClient.put);
const patch = vi.mocked(apiClient.patch);
const del = vi.mocked(apiClient.delete);
/** A field by its label; the label also names its ⓘ button, so ask for the control. */
const INPUT = { selector: 'input, select, button[role="checkbox"]' };

const MINIMOOG = { kind: 'instrument' as const, id: 'moog-minimoog' };

function link(over: Partial<AdminLinkView> & { id: string }): AdminLinkView {
  return {
    owner: { ...MINIMOOG, name: 'Minimoog Model D' },
    url: `https://www.youtube.com/watch?v=${over.id.padEnd(11, 'x')}`,
    provider: 'youtube',
    kind: 'demo',
    title: `Video ${over.id}`,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LinkForm', () => {
  it('refuses to send without an address, or a title over 200 characters', async () => {
    const user = userEvent.setup();
    render(<LinkForm link={null} owner={MINIMOOG} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText('Title', INPUT), 'x'.repeat(201));
    await user.click(screen.getByRole('button', { name: 'Add link' }));

    expect(await screen.findByText('Paste the address')).toBeInTheDocument();
    expect(screen.getByText('At most 200 characters')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps an existing link from losing its title', async () => {
    const user = userEvent.setup();
    render(<LinkForm link={link({ id: 'a' })} onSaved={vi.fn()} />);

    await user.clear(screen.getByLabelText('Title', INPUT));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('A link needs a title')).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
  });

  it('reads the address: stores its standard form and fills an empty title, for the admin to confirm', async () => {
    const user = userEvent.setup();
    post.mockResolvedValueOnce({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      provider: 'youtube',
      title: 'Minimoog demo',
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    });
    render(<LinkForm link={null} owner={MINIMOOG} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText('Address', INPUT), 'https://youtu.be/dQw4w9WgXcQ?t=5');
    await user.click(screen.getByRole('button', { name: 'Read' }));

    expect(post).toHaveBeenCalledWith('/api/v1/admin/links/resolve', {
      body: { url: 'https://youtu.be/dQw4w9WgXcQ?t=5' },
    });
    await waitFor(() => expect(screen.getByLabelText('Title', INPUT)).toHaveValue('Minimoog demo'));
    expect(screen.getByLabelText('Address', INPUT)).toHaveValue(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );
    expect(within(screen.getByTestId('link-preview')).getByText('YouTube')).toBeInTheDocument();
  });

  it('keeps a title the admin already typed over the provider’s', async () => {
    const user = userEvent.setup();
    post.mockResolvedValueOnce({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      provider: 'youtube',
      title: 'Provider title',
      thumbnailUrl: null,
      embedUrl: null,
    });
    render(<LinkForm link={null} owner={MINIMOOG} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText('Address', INPUT), 'https://youtu.be/dQw4w9WgXcQ');
    await user.type(screen.getByLabelText('Title', INPUT), 'My title');
    await user.click(screen.getByRole('button', { name: 'Read' }));

    await screen.findByTestId('link-preview');
    expect(screen.getByLabelText('Title', INPUT)).toHaveValue('My title');
  });

  it('shows why an address was refused when read, and fills nothing', async () => {
    const user = userEvent.setup();
    post.mockRejectedValueOnce(
      new APIClientError('A YouTube link needs its video id', 'VALIDATION_ERROR', 400)
    );
    render(<LinkForm link={null} owner={MINIMOOG} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText('Address', INPUT), 'https://www.youtube.com/@moog');
    await user.click(screen.getByRole('button', { name: 'Read' }));

    expect(await screen.findByText('A YouTube link needs its video id')).toBeInTheDocument();
    expect(screen.getByLabelText('Title', INPUT)).toHaveValue('');
    expect(screen.queryByTestId('link-preview')).not.toBeInTheDocument();
  });

  it('adds a link to its owner with what the admin chose, and hands back what was saved', async () => {
    const user = userEvent.setup();
    const saved = link({ id: 'new', title: 'Demo', ours: true, rating: 4 });
    post.mockResolvedValueOnce(saved);
    const onSaved = vi.fn();
    render(<LinkForm link={null} owner={MINIMOOG} onSaved={onSaved} />);

    await user.type(screen.getByLabelText('Address', INPUT), 'https://example.com/review');
    await user.type(screen.getByLabelText('Title', INPUT), 'Demo');
    await user.selectOptions(screen.getByLabelText('Kind', INPUT), 'review');
    await user.selectOptions(screen.getByLabelText('Rating', INPUT), '4');
    await user.click(screen.getByLabelText('Ours', INPUT));
    await user.click(screen.getByRole('button', { name: 'Add link' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(post).toHaveBeenCalledWith('/api/v1/admin/links', {
      body: {
        owner: MINIMOOG,
        url: 'https://example.com/review',
        kind: 'review',
        title: 'Demo',
        ours: true,
        rating: 4,
      },
    });
  });

  it('leaves the title to the provider when it is empty on a new link', async () => {
    const user = userEvent.setup();
    post.mockResolvedValueOnce(link({ id: 'new' }));
    render(<LinkForm link={null} owner={MINIMOOG} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText('Address', INPUT), 'https://youtu.be/dQw4w9WgXcQ');
    await user.click(screen.getByRole('button', { name: 'Add link' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const body = post.mock.calls[0][1]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('title');
    expect(body.rating).toBeNull();
  });

  it('names the owner on the list page, and puts the server’s refusal on the field it names', async () => {
    const user = userEvent.setup();
    post.mockRejectedValueOnce(
      new APIClientError('That address is already linked here', 'CONFLICT', 409)
    );
    post.mockRejectedValueOnce(
      new APIClientError('There is nothing with that id to link to', 'VALIDATION_ERROR', 400, {
        owner: { kind: 'song', id: 'nope' },
      })
    );
    render(<LinkForm link={null} onSaved={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('About', INPUT), 'song');
    await user.type(screen.getByLabelText('Id', INPUT), 'nope');
    await user.type(screen.getByLabelText('Address', INPUT), 'https://example.com/a');
    await user.type(screen.getByLabelText('Title', INPUT), 'A');
    await user.click(screen.getByRole('button', { name: 'Add link' }));
    expect(await screen.findByText('That address is already linked here')).toBeInTheDocument();
    expect(post.mock.calls[0][1]?.body).toMatchObject({ owner: { kind: 'song', id: 'nope' } });

    await user.click(screen.getByRole('button', { name: 'Add link' }));
    expect(await screen.findByText('There is nothing with that id to link to')).toBeInTheDocument();
    expect(screen.getByLabelText('Id', INPUT)).toHaveAttribute('aria-invalid', 'true');
  });

  it('says an owner’s refusal in the form when the owner is fixed, as there is no field to mark', async () => {
    const user = userEvent.setup();
    post.mockRejectedValueOnce(
      new APIClientError('There is nothing with that id to link to', 'VALIDATION_ERROR', 400, {
        owner: { kind: 'sound', id: 'model-d/gone' },
      })
    );
    const onSaved = vi.fn();
    render(
      <LinkForm link={null} owner={{ kind: 'sound', id: 'model-d/gone' }} onSaved={onSaved} />
    );

    await user.type(screen.getByLabelText('Address', INPUT), 'https://example.com/a');
    await user.type(screen.getByLabelText('Title', INPUT), 'A');
    await user.click(screen.getByRole('button', { name: 'Add link' }));

    expect(await screen.findByText('There is nothing with that id to link to')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('puts a body-validation issue on the field it names, with its own message', async () => {
    const user = userEvent.setup();
    post.mockRejectedValueOnce(
      new APIClientError('Invalid request body', 'VALIDATION_ERROR', 400, {
        errors: [{ path: 'url', message: 'The address must be https' }],
      })
    );
    render(<LinkForm link={null} owner={MINIMOOG} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText('Address', INPUT), 'http://example.com/a');
    await user.type(screen.getByLabelText('Title', INPUT), 'A');
    await user.click(screen.getByRole('button', { name: 'Add link' }));

    expect(await screen.findByText('The address must be https')).toBeInTheDocument();
    expect(screen.getByLabelText('Address', INPUT)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Invalid request body')).not.toBeInTheDocument();
  });

  it('does not call a saved link a failure when its answer cannot be read', async () => {
    const user = userEvent.setup();
    post.mockResolvedValueOnce({ id: 'new', provider: 'myspace' });
    const onSaved = vi.fn();
    render(<LinkForm link={null} owner={MINIMOOG} onSaved={onSaved} />);

    await user.type(screen.getByLabelText('Address', INPUT), 'https://example.com/a');
    await user.type(screen.getByLabelText('Title', INPUT), 'A');
    await user.click(screen.getByRole('button', { name: 'Add link' }));

    expect(
      await screen.findByText(/It saved, but the answer could not be read/)
    ).toBeInTheDocument();
    expect(screen.queryByText("That didn't save. Try again.")).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('drops the preview once the address it was read from is changed', async () => {
    const user = userEvent.setup();
    post.mockResolvedValueOnce({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      provider: 'youtube',
      title: 'Minimoog demo',
      thumbnailUrl: null,
    });
    render(<LinkForm link={null} owner={MINIMOOG} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText('Address', INPUT), 'https://youtu.be/dQw4w9WgXcQ');
    await user.click(screen.getByRole('button', { name: 'Read' }));
    expect(await screen.findByTestId('link-preview')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Address', INPUT));
    await user.type(screen.getByLabelText('Address', INPUT), 'https://vimeo.com/1');
    expect(screen.queryByTestId('link-preview')).not.toBeInTheDocument();
  });

  it('saves an edit with PATCH, never sending the owner', async () => {
    const user = userEvent.setup();
    const existing = link({ id: 'a', rating: 2 });
    patch.mockResolvedValueOnce({ ...existing, title: 'Renamed' });
    const onSaved = vi.fn();
    render(<LinkForm link={existing} onSaved={onSaved} />);

    expect(screen.queryByLabelText('Id', INPUT)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Rating', INPUT)).toHaveValue('2');
    await user.clear(screen.getByLabelText('Title', INPUT));
    await user.type(screen.getByLabelText('Title', INPUT), 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith('/api/v1/admin/links/a', {
      body: { url: existing.url, kind: 'demo', title: 'Renamed', ours: false, rating: 2 },
    });
  });
});

describe('LinksPanel', () => {
  const ours1 = link({ id: 'o1', ours: true, order: 0, title: 'Ours one' });
  const ours2 = link({ id: 'o2', ours: true, order: 1, title: 'Ours two' });
  const other = link({ id: 'x1', title: 'Someone else', views: 1_200_000 });
  const elsewhere = link({
    id: 'z1',
    title: 'About another synth',
    owner: { kind: 'instrument', id: 'arp-odyssey', name: 'ARP Odyssey' },
  });

  it('asks for only its owner’s links, and lists only those, ours first in order', async () => {
    get.mockResolvedValue([other, ours2, elsewhere, ours1]);
    render(<LinksPanel owner={MINIMOOG} />);

    const oursList = await screen.findByRole('list', { name: 'Our links' });
    expect(get).toHaveBeenCalledWith('/api/v1/admin/links', {
      params: { instrument: 'moog-minimoog', page: 1, limit: 100 },
    });
    expect(
      within(oursList)
        .getAllByRole('link')
        .map((a) => a.textContent)
    ).toEqual(['Ours one', 'Ours two']);
    const others = screen.getByRole('list', { name: 'Other links' });
    expect(within(others).getByText('Someone else')).toBeInTheDocument();
    expect(within(others).getByText(/1\.2M views/)).toBeInTheDocument();
    expect(screen.queryByText('About another synth')).not.toBeInTheDocument();
  });

  it('asks for a patch’s links by <synth>/<patch>', async () => {
    get.mockResolvedValue([]);
    render(<LinksPanel owner={{ kind: 'sound', id: 'model-d/stacked-night-bass' }} />);

    expect(await screen.findByText('No links yet.')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/v1/admin/links', {
      params: { sound: 'model-d/stacked-night-bass', page: 1, limit: 100 },
    });
  });

  it('sends the whole new order when one of ours moves, and shows it', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue([ours1, ours2, other]);
    put.mockResolvedValueOnce({ ids: ['o2', 'o1'] });
    render(<LinksPanel owner={MINIMOOG} />);

    await user.click(await screen.findByRole('button', { name: 'Move Ours two up' }));

    expect(put).toHaveBeenCalledWith('/api/v1/admin/links/order', {
      body: { owner: MINIMOOG, ids: ['o2', 'o1'] },
    });
    const oursList = screen.getByRole('list', { name: 'Our links' });
    expect(
      within(oursList)
        .getAllByRole('link')
        .map((a) => a.textContent)
    ).toEqual(['Ours two', 'Ours one']);
  });

  it('puts the order back and says why when the reorder is refused', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue([ours1, ours2]);
    put.mockRejectedValueOnce(
      new APIClientError('Its own videos changed while you were ordering them', 'CONFLICT', 409)
    );
    render(<LinksPanel owner={MINIMOOG} />);

    await user.click(await screen.findByRole('button', { name: 'Move Ours one down' }));

    expect(
      await screen.findByText('Its own videos changed while you were ordering them')
    ).toBeInTheDocument();
    const oursList = screen.getByRole('list', { name: 'Our links' });
    expect(
      within(oursList)
        .getAllByRole('link')
        .map((a) => a.textContent)
    ).toEqual(['Ours one', 'Ours two']);
  });

  it('removes a link only after it is confirmed, then reloads the list', async () => {
    const user = userEvent.setup();
    get.mockResolvedValueOnce([other]).mockResolvedValueOnce([]);
    del.mockResolvedValueOnce(undefined);
    render(<LinksPanel owner={MINIMOOG} />);

    await user.click(await screen.findByRole('button', { name: 'Remove Someone else' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/will no longer show on Minimoog Model D/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(del).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remove Someone else' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' })
    );

    expect(del).toHaveBeenCalledWith('/api/v1/admin/links/x1');
    expect(await screen.findByText('No links yet.')).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('reads every page of its links, so a reorder can name each of ours', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 100 }, (_, i) => link({ id: `n${i}` }));
    const lateOurs = link({ id: 'o9', ours: true, order: 1, title: 'Ours late' });
    get.mockResolvedValueOnce(many).mockResolvedValueOnce([ours1, lateOurs]);
    put.mockResolvedValueOnce({ ids: ['o9', 'o1'] });
    render(<LinksPanel owner={MINIMOOG} />);

    await user.click(await screen.findByRole('button', { name: 'Move Ours late up' }));

    expect(get).toHaveBeenNthCalledWith(2, '/api/v1/admin/links', {
      params: { instrument: 'moog-minimoog', page: 2, limit: 100 },
    });
    expect(put).toHaveBeenCalledWith('/api/v1/admin/links/order', {
      body: { owner: MINIMOOG, ids: ['o9', 'o1'] },
    });
  });

  it('keeps the newest load when an older one answers after it', async () => {
    let answerStale: (v: unknown) => void = () => {};
    get
      .mockImplementationOnce(() => new Promise((resolve) => (answerStale = resolve)))
      .mockResolvedValueOnce([elsewhere]);
    const { rerender } = render(<LinksPanel owner={MINIMOOG} />);
    rerender(<LinksPanel owner={{ kind: 'instrument', id: 'arp-odyssey' }} />);
    expect(await screen.findByText('About another synth')).toBeInTheDocument();

    answerStale([other]);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Someone else')).not.toBeInTheDocument();
    expect(screen.getByText('About another synth')).toBeInTheDocument();
  });

  it('says so when its links could not be loaded', async () => {
    get.mockRejectedValueOnce(new Error('down'));
    render(<LinksPanel owner={MINIMOOG} />);
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
  });
});

describe('LinksTable', () => {
  const rows = [
    link({
      id: 'a',
      title: 'Demo A',
      views: 34_000,
      likes: 900,
      statsAt: '2026-11-04T00:00:00.000Z',
    }),
    link({
      id: 'b',
      title: 'Patch walk-through',
      provider: 'other',
      url: 'https://example.com/b',
      owner: { kind: 'sound', id: 'model-d/stacked-night-bass', name: 'Stacked night bass' },
    }),
  ];

  it('shows each link with what it is about, linked to its editor, and its counts', () => {
    render(
      <LinksTable
        links={rows}
        filters={{ owner: '', provider: '', ours: '' }}
        page={1}
        totalPages={1}
        total={2}
      />
    );

    expect(screen.getByRole('link', { name: 'Minimoog Model D' })).toHaveAttribute(
      'href',
      '/admin/synths/bank/instruments/moog-minimoog'
    );
    expect(screen.getByRole('link', { name: 'Stacked night bass' })).toHaveAttribute(
      'href',
      '/admin/synths/catalogue/model-d/sounds/stacked-night-bass'
    );
    expect(screen.getByText('34K')).toBeInTheDocument();
    expect(screen.getByText('900')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Web link' })).toBeInTheDocument();
  });

  it('puts a filter in the address, back on the first page, keeping the others', async () => {
    const user = userEvent.setup();
    render(
      <LinksTable
        links={rows}
        filters={{ owner: '', provider: 'youtube', ours: '' }}
        page={2}
        totalPages={3}
        total={120}
      />
    );

    await user.selectOptions(screen.getByLabelText('About'), 'sound');
    expect(mockPush).toHaveBeenCalledWith('/admin/synths/links?provider=youtube&owner=sound');

    await user.selectOptions(screen.getByLabelText('Provider'), '');
    expect(mockPush).toHaveBeenLastCalledWith('/admin/synths/links');

    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/admin/synths/links?provider=youtube&page=3'
    );
  });
});

describe('LinksTable edges', () => {
  it('says there are none yet, or that nothing matches a filter', () => {
    const { unmount } = render(
      <LinksTable
        links={[]}
        filters={{ owner: '', provider: '', ours: '' }}
        page={1}
        totalPages={0}
        total={0}
      />
    );
    expect(screen.getByText('No links yet.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument();
    unmount();

    render(
      <LinksTable
        links={[]}
        filters={{ owner: '', provider: '', ours: 'true' }}
        page={1}
        totalPages={0}
        total={0}
      />
    );
    expect(screen.getByText('Nothing matches.')).toBeInTheDocument();
  });

  it('offers no page before the first or after the last', () => {
    const { unmount } = render(
      <LinksTable
        links={[link({ id: 'a' })]}
        filters={{ owner: '', provider: '', ours: '' }}
        page={1}
        totalPages={2}
        total={60}
      />
    );
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Next' })).toBeInTheDocument();
    unmount();

    render(
      <LinksTable
        links={[link({ id: 'a' })]}
        filters={{ owner: '', provider: '', ours: '' }}
        page={2}
        totalPages={2}
        total={60}
      />
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/admin/synths/links?provider=youtube&page=1'
    );
  });

  it('edits a link in a dialog and reloads the page after it saves', async () => {
    const user = userEvent.setup();
    const row = link({ id: 'a', title: 'Demo A' });
    patch.mockResolvedValueOnce({ ...row, title: 'Demo A, renamed' });
    render(
      <LinksTable
        links={[row]}
        filters={{ owner: '', provider: '', ours: '' }}
        page={1}
        totalPages={1}
        total={1}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Edit Demo A' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Title', INPUT), ', renamed');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith('/api/v1/admin/links/a', {
      body: expect.objectContaining({ title: 'Demo A, renamed' }) as unknown,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says why a removal failed, and keeps the row', async () => {
    const user = userEvent.setup();
    del.mockRejectedValueOnce(new APIClientError('Link not found', 'NOT_FOUND', 404));
    render(
      <LinksTable
        links={[link({ id: 'a', title: 'Demo A' })]}
        filters={{ owner: '', provider: '', ours: '' }}
        page={1}
        totalPages={1}
        total={1}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Remove Demo A' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' })
    );

    expect(await screen.findByText('Link not found')).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(screen.getByText('Demo A')).toBeInTheDocument();
  });
});

describe('the links admin data', () => {
  it('keeps each link that reads, drops one that does not, and reads anything but a list as none', () => {
    const good = link({ id: 'a' });
    expect(readLinks([good, { id: 'broken' }])).toEqual([good]);
    expect(readLinks({ links: [good] })).toEqual([]);
  });

  it('points each owner at its own editor', () => {
    expect(ownerAdminPath({ kind: 'song', id: 'kraftwerk-autobahn' })).toBe(
      '/admin/synths/bank/songs/kraftwerk-autobahn'
    );
    expect(ownerAdminPath({ kind: 'artist', id: 'aphex-twin' })).toBe(
      '/admin/synths/bank/artists/aphex-twin'
    );
  });

  it('shows a missing count as a dash', () => {
    expect(formatCount(null)).toBe('—');
    expect(formatCount(950)).toBe('950');
  });
});
