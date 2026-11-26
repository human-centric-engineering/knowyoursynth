// @vitest-environment happy-dom

/**
 * FamilyForm (`f-synth-families` t-323): one synth family, created with `POST /api/v1/admin/synths/families`, saved
 * whole with `PUT …/[id]` and deleted with `DELETE …/[id]`. Every field has its ⓘ, and a refused save shows by Save.
 *
 * @see components/app/admin/catalogue/family-form.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FamilyForm, type FamilyFormOptions } from '@/components/app/admin/catalogue/family-form';
import { apiClient, APIClientError } from '@/lib/api/client';
import type { AdminFamily } from '@/lib/app/families/edit';

const mockPush = vi.hoisted(() => vi.fn());
const mockRefresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: { post: vi.fn(), put: vi.fn(), delete: vi.fn() },
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
const put = vi.mocked(apiClient.put);
const del = vi.mocked(apiClient.delete);
/** A field by its label; the label also names its ⓘ button, so ask for the control. */
const INPUT = { selector: 'input, textarea, select' };

const OPTIONS: FamilyFormOptions = {
  synths: [
    { id: 'td-3', name: 'Behringer TD-3' },
    { id: 'tb-303', name: 'Roland TB-303' },
  ],
  instruments: [
    { id: 'behringer-td-3', name: 'TD-3', detail: 'Behringer · 2019' },
    { id: 'roland-tb-303', name: 'TB-303', detail: 'Roland · 1981' },
  ],
};

const FAMILY: AdminFamily = {
  id: 'tb-303',
  name: 'TB-303',
  defaultMember: 'td-3',
  editedAt: null,
  members: [
    {
      slug: 'td-3',
      label: 'TD-3',
      instrument: 'behringer-td-3',
      synth: 'td-3',
      differences: 'A copy.',
    },
    {
      slug: 'tb-303',
      label: 'TB-303',
      instrument: 'roland-tb-303',
      synth: 'tb-303',
      differences: 'The original.',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FamilyForm', () => {
  it('gives every field its ⓘ', () => {
    render(<FamilyForm family={FAMILY} options={OPTIONS} />);

    for (const name of [
      'About the name',
      'About the originals',
      'About the members',
      'About the member it opens on',
    ])
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    for (const name of [
      'About the slug',
      'About the label',
      'About the instrument',
      'About the synth',
      'About the differences',
    ])
      expect(screen.getAllByRole('button', { name })).toHaveLength(2);
  });

  it('saves the family whole, its members in the order shown', async () => {
    const user = userEvent.setup();
    put.mockResolvedValue({ ...FAMILY, defaultMember: 'tb-303' });
    render(<FamilyForm family={FAMILY} options={OPTIONS} />);

    await user.click(screen.getByRole('button', { name: 'Move member 2 up' }));
    await user.selectOptions(screen.getByLabelText(/Opens on/, INPUT), 'tb-303');
    await user.click(screen.getByRole('button', { name: 'Save family' }));

    expect(put).toHaveBeenCalledWith('/api/v1/admin/synths/families/tb-303', {
      body: {
        name: 'TB-303',
        defaultMember: 'tb-303',
        members: [FAMILY.members[1], FAMILY.members[0]],
      },
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('sends the originals typed, split on commas and spaces, and none when the field is left empty (t-324)', async () => {
    const user = userEvent.setup();
    put.mockResolvedValue(FAMILY);
    render(<FamilyForm family={{ ...FAMILY, originals: ['roland-tb-303'] }} options={OPTIONS} />);
    const field = screen.getByLabelText(/Originals/, INPUT);
    expect(field).toHaveValue('roland-tb-303');

    await user.type(field, ',  korg-ms-20 ');
    await user.click(screen.getByRole('button', { name: 'Save family' }));
    expect(put.mock.calls[0][1]?.body).toMatchObject({
      originals: ['roland-tb-303', 'korg-ms-20'],
    });

    await user.clear(field);
    await user.click(screen.getByRole('button', { name: 'Save family' }));
    expect(put.mock.calls[1][1]?.body).not.toHaveProperty('originals');
  });

  it('adds an unmodelled member without a synth', async () => {
    const user = userEvent.setup();
    put.mockResolvedValue(FAMILY);
    render(<FamilyForm family={FAMILY} options={OPTIONS} />);

    await user.click(screen.getByRole('button', { name: 'Add a member' }));
    const third = screen.getByText('Member 3').parentElement as HTMLElement;
    await user.type(within(third).getByLabelText(/Slug/, INPUT), 'tb-03');
    await user.type(within(third).getByLabelText(/Label/, INPUT), 'TB-03');
    await user.type(within(third).getByLabelText(/Instrument/, INPUT), 'roland-tb-03');
    await user.type(within(third).getByLabelText(/Differences/, INPUT), 'Reissue.');
    await user.click(screen.getByRole('button', { name: 'Save family' }));

    const body = put.mock.calls[0][1]?.body as { members: unknown[] };
    expect(body.members[2]).toEqual({
      slug: 'tb-03',
      label: 'TB-03',
      instrument: 'roland-tb-03',
      differences: 'Reissue.',
    });
  });

  it("shows a refused save by Save, with the family's problem and a field's own message", async () => {
    const user = userEvent.setup();
    put.mockRejectedValue(
      new APIClientError('The family has 2 problems', 'VALIDATION_ERROR', 400, {
        errors: [
          {
            path: '',
            message:
              'family tb-303: its members trace back to different originals (korg-ms-20, roland-tb-303)',
          },
          { path: 'members.1.label', message: 'Too long' },
        ],
      })
    );
    render(<FamilyForm family={FAMILY} options={OPTIONS} />);

    await user.click(screen.getByRole('button', { name: 'Save family' }));

    const alert = await screen.findByText(/trace back to different originals/);
    const box = alert.closest('[role="alert"]') as HTMLElement;
    expect(box).toHaveTextContent('1 field needs fixing.');
    expect(box.parentElement).toContainElement(screen.getByRole('button', { name: 'Save family' }));
    expect(screen.getByText('Too long')).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("shows an original's own message under Originals, filed under its index (t-324)", async () => {
    const user = userEvent.setup();
    put.mockRejectedValue(
      new APIClientError('Invalid request body', 'VALIDATION_ERROR', 400, {
        errors: [{ path: 'originals.1', message: 'must be lowercase letters, digits and hyphens' }],
      })
    );
    render(<FamilyForm family={FAMILY} options={OPTIONS} />);
    const field = screen.getByLabelText(/Originals/, INPUT);
    await user.type(field, 'roland-tb-303, Roland-TB-303');

    await user.click(screen.getByRole('button', { name: 'Save family' }));

    expect(
      await screen.findByText('must be lowercase letters, digits and hyphens')
    ).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('creates a new family, sending its id, and opens it', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue(FAMILY);
    render(<FamilyForm family={null} options={OPTIONS} />);

    await user.type(screen.getByLabelText(/^Id/, INPUT), 'tb-303');
    await user.type(screen.getByLabelText(/^Name/, INPUT), 'TB-303');
    await user.click(screen.getByRole('button', { name: 'Create family' }));

    expect(post).toHaveBeenCalledWith(
      '/api/v1/admin/synths/families',
      expect.objectContaining({ body: expect.objectContaining({ id: 'tb-303', name: 'TB-303' }) })
    );
    expect(mockPush).toHaveBeenCalledWith('/admin/synths/catalogue/families/tb-303');
  });

  it("leaves a new family's default unchosen as its slugs are typed", async () => {
    const user = userEvent.setup();
    post.mockResolvedValue(FAMILY);
    render(<FamilyForm family={null} options={OPTIONS} />);

    const first = screen.getByText('Member 1').parentElement as HTMLElement;
    await user.type(within(first).getByLabelText(/Slug/, INPUT), 'tb-303');
    await user.click(screen.getByRole('button', { name: 'Create family' }));

    expect(post.mock.calls[0][1]?.body).toMatchObject({ defaultMember: '' });
  });

  it('carries the default to its renamed slug, trimmed', async () => {
    const user = userEvent.setup();
    put.mockResolvedValue(FAMILY);
    render(<FamilyForm family={FAMILY} options={OPTIONS} />);

    const first = screen.getByText('Member 1').parentElement as HTMLElement;
    await user.type(within(first).getByLabelText(/Slug/, INPUT), 'x ');
    await user.click(screen.getByRole('button', { name: 'Save family' }));

    expect(put.mock.calls[0][1]?.body).toMatchObject({ defaultMember: 'td-3x' });
  });

  it('leaves the default with another row that still has its slug', async () => {
    const user = userEvent.setup();
    put.mockResolvedValue(FAMILY);
    render(<FamilyForm family={FAMILY} options={OPTIONS} />);

    const second = screen.getByText('Member 2').parentElement as HTMLElement;
    const slug = within(second).getByLabelText(/Slug/, INPUT);
    await user.clear(slug);
    await user.type(slug, 'td-3');
    const first = screen.getByText('Member 1').parentElement as HTMLElement;
    await user.type(within(first).getByLabelText(/Slug/, INPUT), 'a');
    await user.click(screen.getByRole('button', { name: 'Save family' }));

    expect(put.mock.calls[0][1]?.body).toMatchObject({ defaultMember: 'td-3' });
  });

  it('clears the default when its member is removed or loses its synth', async () => {
    const user = userEvent.setup();
    put.mockResolvedValue(FAMILY);
    const { unmount } = render(<FamilyForm family={FAMILY} options={OPTIONS} />);

    await user.click(screen.getAllByRole('button', { name: 'Remove member' })[0]);
    await user.click(screen.getByRole('button', { name: 'Save family' }));
    expect(put.mock.calls[0][1]?.body).toMatchObject({ defaultMember: '' });
    unmount();

    render(<FamilyForm family={FAMILY} options={OPTIONS} />);
    const first = screen.getByText('Member 1').parentElement as HTMLElement;
    await user.selectOptions(within(first).getByLabelText(/Synth/, INPUT), '');
    await user.click(screen.getByRole('button', { name: 'Save family' }));
    expect(put.mock.calls[1][1]?.body).toMatchObject({ defaultMember: '' });
  });

  it('deletes only once confirmed, then returns to the list', async () => {
    const user = userEvent.setup();
    del.mockResolvedValue({ id: 'tb-303', deleted: true });
    render(<FamilyForm family={FAMILY} options={OPTIONS} />);

    await user.click(screen.getByRole('button', { name: 'Delete family' }));
    expect(del).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(del).toHaveBeenCalledWith('/api/v1/admin/synths/families/tb-303');
    expect(mockPush).toHaveBeenCalledWith('/admin/synths/catalogue/families');
  });
});
