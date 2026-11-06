// @vitest-environment happy-dom

/**
 * Unit Tests: Suggest a link (`f-link-suggestions` t-186), the form every Videos and links surface carries.
 *
 * Pins: nothing to suggest for draws nothing; signed out, it offers sign-in back to this page (its query too) and sends nothing;
 * signed in, the form posts the target it was given (or the one chosen, when there are several) with empty optional
 * fields left out; a bad address is caught before sending; a 409 and a 400 are shown on the address in the server's
 * words, a 429 says to wait; once sent it says so and offers another; the container is told when it opens.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const post = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiClient: { post },
}));
const mockSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/client', () => ({ useSession: () => mockSession() }));

import { SuggestLink } from '@/components/app/links/suggest-link';
import { APIClientError } from '@/lib/api/client';

const MINIMOOG = { kind: 'instrument' as const, id: 'moog-minimoog', name: 'Minimoog Model D' };
const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const signedIn = () =>
  mockSession.mockReturnValue({ data: { user: { id: 'user-1' } }, isPending: false });

function openForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Suggest a link' }));
}
/** A field by its label; the label also names its ⓘ button, so ask for the control. */
const INPUT = { selector: 'input, select, textarea' };
const field = (label: RegExp) => screen.getByLabelText(label, INPUT);
function fill(label: RegExp, value: string) {
  fireEvent.change(field(label), { target: { value } });
}
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }));

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ id: 'lsug-1' });
  signedIn();
});

describe('SuggestLink', () => {
  it('draws nothing, and asks nothing of the session, with nothing to suggest for', () => {
    const { container } = render(<SuggestLink targets={[]} />);
    expect(container.innerHTML).toBe('');
    expect(mockSession).not.toHaveBeenCalled();
  });

  it('draws nothing while the session is being read', () => {
    mockSession.mockReturnValue({ data: null, isPending: true });
    const { container } = render(<SuggestLink targets={[MINIMOOG]} />);
    expect(container.innerHTML).toBe('');
  });

  it('offers a signed-out visitor sign-in back to this page, and no form', () => {
    mockSession.mockReturnValue({ data: null, isPending: false });
    window.history.pushState({}, '', '/synths/model-d?sound=fat-bass');
    render(<SuggestLink targets={[MINIMOOG]} />);
    // The query too: a synth page opens on the sound it names.
    expect(screen.getByRole('link', { name: 'Sign in to suggest a link' })).toHaveAttribute(
      'href',
      `/login?callbackUrl=${encodeURIComponent('/synths/model-d?sound=fat-bass')}`
    );
    expect(screen.queryByRole('button', { name: 'Suggest a link' })).toBeNull();
  });

  it('posts the target it was given, leaving out empty optional fields', async () => {
    const onOpenChange = vi.fn();
    render(<SuggestLink targets={[MINIMOOG]} onOpenChange={onOpenChange} />);
    openForm();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(
      screen.getByRole('heading', { name: 'Suggest a link for Minimoog Model D' })
    ).toBeInTheDocument();
    fill(/^Address/, VIDEO);
    fireEvent.change(field(/^Kind/), { target: { value: 'review' } });
    send();

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/api/v1/links/suggestions', {
      body: { target: { kind: 'instrument', id: 'moog-minimoog' }, url: VIDEO, kind: 'review' },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Thanks: your link is with the people who look after the videos.'
    );
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('sends the title and note when given, trimmed', async () => {
    render(
      <SuggestLink targets={[{ kind: 'song', id: 'kraftwerk-autobahn', name: 'Autobahn' }]} />
    );
    openForm();
    fill(/^Address/, VIDEO);
    fill(/^Title/, '  Autobahn, live  ');
    fill(/^Anything else/, ' The 1975 broadcast. ');
    send();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toEqual({
      body: {
        target: { kind: 'song', id: 'kraftwerk-autobahn' },
        url: VIDEO,
        kind: 'demo',
        title: 'Autobahn, live',
        note: 'The 1975 broadcast.',
      },
    });
  });

  it('asks which instrument when there are several, and posts the one chosen', async () => {
    const odyssey = { kind: 'instrument' as const, id: 'arp-odyssey', name: 'ARP Odyssey' };
    render(<SuggestLink targets={[MINIMOOG, odyssey]} />);
    openForm();
    expect(screen.getByRole('heading', { name: 'Suggest a link' })).toBeInTheDocument();
    fireEvent.change(field(/^About/), {
      target: { value: 'instrument:arp-odyssey' },
    });
    fill(/^Address/, VIDEO);
    send();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1].body.target).toEqual({ kind: 'instrument', id: 'arp-odyssey' });
  });

  it('catches a missing address before sending anything', () => {
    render(<SuggestLink targets={[MINIMOOG]} />);
    openForm();
    send();
    expect(field(/^Address/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Give the link');
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    [409, 'That link is already listed here'],
    [409, 'That link has already been suggested here'],
    [400, 'Give a YouTube video, not a channel'],
  ])('shows a %i on the address, in its own words', async (status, message) => {
    post.mockRejectedValue(
      new APIClientError(message, 'X', status, status === 400 ? { url: message } : undefined)
    );
    render(<SuggestLink targets={[MINIMOOG]} />);
    openForm();
    fill(/^Address/, VIDEO);
    send();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(field(/^Address/)).toHaveAttribute('aria-invalid', 'true');
    // Still open, with what was typed, to change it.
    expect(field(/^Address/)).toHaveValue(VIDEO);
  });

  it('says a 400 about anything but the address under the form, not on the address', async () => {
    post.mockRejectedValue(
      new APIClientError('Invalid request body', 'VALIDATION_ERROR', 400, {
        errors: [{ path: 'note', message: 'Too long' }],
      })
    );
    render(<SuggestLink targets={[MINIMOOG]} />);
    openForm();
    fill(/^Address/, VIDEO);
    send();
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid request body');
    expect(field(/^Address/)).not.toHaveAttribute('aria-invalid');
  });

  it('starts afresh when cancelled and opened again', async () => {
    post.mockRejectedValue(new APIClientError('That link is already listed here', 'X', 409));
    render(<SuggestLink targets={[MINIMOOG]} />);
    openForm();
    fill(/^Address/, VIDEO);
    send();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    openForm();
    expect(field(/^Address/)).toHaveValue('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says to wait after a 429', async () => {
    post.mockRejectedValue(new APIClientError('Too many requests', 'RATE_LIMIT_EXCEEDED', 429));
    render(<SuggestLink targets={[MINIMOOG]} />);
    openForm();
    fill(/^Address/, VIDEO);
    send();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have sent a lot of suggestions in the last hour. Try again later.'
    );
  });

  it('says a target that has gone is no longer here', async () => {
    post.mockRejectedValue(new APIClientError('Not found', 'NOT_FOUND', 404));
    render(<SuggestLink targets={[MINIMOOG]} />);
    openForm();
    fill(/^Address/, VIDEO);
    send();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This is no longer here to suggest a link for.'
    );
  });

  it('offers another once sent, starting empty', async () => {
    render(<SuggestLink targets={[MINIMOOG]} />);
    openForm();
    fill(/^Address/, VIDEO);
    send();
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest another' }));
    expect(field(/^Address/)).toHaveValue('');
  });
});
