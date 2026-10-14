// @vitest-environment happy-dom

/**
 * BankForm (`f-databank` t-36): one databank row, created with `POST /api/v1/admin/bank/[kind]`, saved whole with
 * `PUT …/[id]` and removed with `DELETE …/[id]`. Every refusal shows what the server named.
 *
 * @see components/app/admin/bank/bank-form.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BankForm, bodyOf, draftOf } from '@/components/app/admin/bank/bank-form';
import { apiClient, APIClientError } from '@/lib/api/client';
import type { AdminBankDetail } from '@/lib/app/bank/admin';

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
/** A field by its label; the label also names its ⓘ button, so ask for the input. */
const INPUT = { selector: 'input, textarea, select' };

const SONG: AdminBankDetail = {
  kind: 'songs',
  editedAt: null,
  row: {
    id: 'bach',
    title: 'Switched-On Bach',
    kind: 'album',
    year: '1968',
    artists: ['wendy-carlos'],
    parts: [
      {
        instruments: ['moog-modular'],
        on: 'Moog modular',
        synths: ['model-d'],
        sounds: { 'model-d': 'baroque-line-voice', 'system-15': 's15-brass' },
        text: 'Every line overdubbed.',
      },
    ],
  },
};

const ARTIST: AdminBankDetail = {
  kind: 'artists',
  editedAt: '2026-10-14T00:00:00.000Z',
  memberOf: ['depeche-mode'],
  row: {
    id: 'vince-clarke',
    name: 'Vince Clarke',
    kind: 'person',
    country: 'UK',
    active: '1980–',
    eras: [],
    genres: ['synth-pop'],
    roles: ['player', 'writer'],
    summary: 'Summary.',
    story: 'Story.',
    innovations: ['One', 'Two'],
  },
};

const sentBody = (mock: typeof put | typeof post) =>
  mock.mock.calls[0][1]?.body as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('draftOf and bodyOf', () => {
  it('round-trip a song with its parts and per-synth rows', () => {
    const { id: _id, ...song } = SONG.row;
    expect(bodyOf('songs', draftOf('songs', SONG.row), false)).toEqual(song);
  });

  it('round-trip an artist, lines and comma lists alike', () => {
    const { id: _id, ...artist } = ARTIST.row;
    expect(bodyOf('artists', draftOf('artists', ARTIST.row), false)).toEqual({
      ...artist,
      members: [],
      instruments: [],
    });
  });
});

describe('BankForm', () => {
  it('saves an edited song whole, with a synth row added to its part', async () => {
    const user = userEvent.setup();
    put.mockImplementation(async (_path, opts) => ({ id: 'bach', ...(opts?.body as object) }));
    render(<BankForm kind="songs" detail={SONG} />);

    await user.clear(screen.getByLabelText(/^Title/, INPUT));
    await user.type(screen.getByLabelText(/^Title/, INPUT), 'New title');
    await user.click(screen.getByRole('button', { name: 'Add an app synth' }));
    const synthIds = screen.getAllByLabelText('Synth', INPUT);
    await user.type(synthIds[2], 'minimoog');
    await user.type(screen.getAllByLabelText(/^Note/, INPUT)[2], 'Heard here too.');
    await user.click(screen.getByRole('button', { name: 'Save record' }));

    expect(put).toHaveBeenCalledWith('/api/v1/admin/bank/songs/bach', expect.anything());
    expect(sentBody(put)).toMatchObject({
      title: 'New title',
      parts: [
        {
          instruments: ['moog-modular'],
          synths: ['model-d'],
          sounds: { 'model-d': 'baroque-line-voice', 'system-15': 's15-brass' },
          notes: { minimoog: 'Heard here too.' },
        },
      ],
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it("shows the server's refusal, naming each reference the save would break", async () => {
    const user = userEvent.setup();
    put.mockRejectedValue(
      new APIClientError(
        'The record would break a reference in the databank',
        'VALIDATION_ERROR',
        400,
        {
          errors: [{ path: '', message: 'song bach: unknown instrument moog-nope' }],
        }
      )
    );
    render(<BankForm kind="songs" detail={SONG} />);

    await user.click(screen.getByRole('button', { name: 'Save record' }));

    const alert = await screen.findByText('The record would break a reference in the databank');
    expect(
      within(alert.closest('[role="alert"]') as HTMLElement).getByText(
        'song bach: unknown instrument moog-nope'
      )
    ).toBeInTheDocument();
  });

  it('places a field problem on its field', async () => {
    const user = userEvent.setup();
    put.mockRejectedValue(
      new APIClientError('Validation failed', 'VALIDATION_ERROR', 400, {
        errors: [{ path: 'parts.0.on', message: 'Required' }],
      })
    );
    render(<BankForm kind="songs" detail={SONG} />);
    await user.click(screen.getByRole('button', { name: 'Save record' }));

    expect(await screen.findByText('Required')).toBeInTheDocument();
    expect(screen.getByLabelText(/^On/, INPUT)).toHaveAttribute('aria-invalid', 'true');
  });

  it('creates a new row with the id typed, then opens it', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({});
    render(<BankForm kind="makers" detail={null} />);

    await user.type(screen.getByLabelText(/^Id/, INPUT), 'don-buchla');
    await user.type(screen.getByLabelText(/^Name/, INPUT), 'Don Buchla');
    await user.type(screen.getByLabelText(/^Companies/, INPUT), 'Buchla and Associates');
    await user.click(screen.getByRole('button', { name: 'Create innovator' }));

    expect(post).toHaveBeenCalledWith('/api/v1/admin/bank/makers', expect.anything());
    expect(sentBody(post)).toMatchObject({
      id: 'don-buchla',
      name: 'Don Buchla',
      companies: ['Buchla and Associates'],
    });
    expect(sentBody(post)).not.toHaveProperty('born');
    expect(mockPush).toHaveBeenCalledWith('/admin/synths/bank/makers/don-buchla');
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });

  it("shows an artist's groups as links, not as a field", () => {
    render(<BankForm kind="artists" detail={ARTIST} />);
    expect(screen.getByRole('link', { name: 'depeche-mode' })).toHaveAttribute(
      'href',
      '/admin/synths/bank/artists/depeche-mode'
    );
    expect(screen.queryByLabelText(/Member of/, INPUT)).toBeNull();
  });

  it('removes after confirming, and shows what still points at the row when refused', async () => {
    const user = userEvent.setup();
    del.mockRejectedValueOnce(
      new APIClientError(
        'The artist cannot be removed while the databank still points at it',
        'CONFLICT',
        409,
        {
          errors: [{ path: '', message: 'song bach: unknown artist vince-clarke' }],
        }
      )
    );
    render(<BankForm kind="artists" detail={ARTIST} />);

    await user.click(screen.getByRole('button', { name: 'Remove artist' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(del).toHaveBeenCalledWith('/api/v1/admin/bank/artists/vince-clarke');
    expect(await screen.findByText('song bach: unknown artist vince-clarke')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();

    del.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole('button', { name: 'Remove artist' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mockPush).toHaveBeenCalledWith('/admin/synths/bank?kind=artists');
  });

  it('gives every non-trivial field an explanation', () => {
    render(<BankForm kind="instruments" detail={null} />);
    for (const label of ['Company', 'Year', 'People', 'App synths', 'Recreation of', 'Id'])
      expect(
        screen.getByRole('button', { name: `About ${label.toLowerCase()}` })
      ).toBeInTheDocument();
  });
});
