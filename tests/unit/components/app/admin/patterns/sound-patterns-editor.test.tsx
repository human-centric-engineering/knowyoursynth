// @vitest-environment happy-dom

/**
 * SoundPatternsEditor (`f-pattern-library` t-126): a patch's patterns in order, the first its default. Moving them and
 * choosing a default change nothing until Save, which sends the whole order; nothing can be taken off.
 *
 * @see components/app/admin/patterns/sound-patterns-editor.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SoundPatternsEditor } from '@/components/app/admin/patterns/sound-patterns-editor';
import { APIClientError, apiClient } from '@/lib/api/client';
import type { AdminSoundPatterns } from '@/lib/app/patterns/library-edit';
import { adminLibraryPattern } from '@/tests/helpers/admin-library-pattern';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiClient: { put: vi.fn() },
}));

const A = 'cpat00000000000000000000a';
const B = 'cpat00000000000000000000b';
const C = 'cpat00000000000000000000c';

const SOUND: AdminSoundPatterns = {
  synthId: 'model-d',
  slug: 'funk-bass',
  name: 'Funk bass',
  patterns: [
    adminLibraryPattern({ id: A, name: 'The riff' }),
    adminLibraryPattern({ id: B, name: 'Researched', fidelity: 'reconstructed' }),
    { id: C, key: 'admin:c', name: 'Broken', problem: 'It no longer parses' },
  ],
};

const put = vi.mocked(apiClient.put);
const names = () =>
  within(screen.getByRole('list', { name: 'Patterns in order' }))
    .getAllByRole('listitem')
    .map((li) => within(li).getAllByRole('link')[0].textContent);
const saveOrder = () => screen.getByRole('button', { name: 'Save order' });

beforeEach(() => {
  put.mockReset();
  put.mockImplementation(async (_url, options) => options?.body);
});

describe('SoundPatternsEditor', () => {
  it('makes another pattern the default, keeping the old one on, and saves the whole order', async () => {
    const user = userEvent.setup();
    render(<SoundPatternsEditor sound={SOUND} />);

    expect(names()).toEqual(['The riff', 'Researched', 'Broken']);
    expect(screen.getByText('It no longer parses')).toBeInTheDocument();
    expect(saveOrder()).toBeDisabled();
    // Nothing on the page takes a pattern off.
    expect(screen.queryByRole('button', { name: /remove|delete/i })).toBeNull();

    const researched = screen.getByRole('link', { name: 'Researched' }).closest('li')!;
    await user.click(within(researched).getByRole('button', { name: 'Make default' }));

    expect(names()).toEqual(['Researched', 'The riff', 'Broken']);
    expect(screen.getByText('Was the default')).toBeInTheDocument();
    expect(screen.getByText(/Saving makes Researched the default/)).toBeInTheDocument();
    await user.click(saveOrder());

    expect(put).toHaveBeenCalledWith('/api/v1/admin/synths/model-d/sounds/funk-bass/patterns', {
      body: { patternIds: [B, A, C] },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The patch’s riff is now its new default.'
    );
    expect(screen.queryByText('Was the default')).toBeNull();
    expect(saveOrder()).toBeDisabled();
  });

  it('moves a pattern behind the default without changing it, and undoes changes', async () => {
    const user = userEvent.setup();
    render(<SoundPatternsEditor sound={SOUND} />);

    expect(screen.getByRole('button', { name: 'Move The riff up' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Move Broken up' }));
    expect(names()).toEqual(['The riff', 'Broken', 'Researched']);
    expect(screen.queryByText(/Saving makes/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Undo changes' }));
    expect(names()).toEqual(['The riff', 'Researched', 'Broken']);
    expect(saveOrder()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Move Researched down' }));
    await user.click(saveOrder());
    expect(put.mock.calls[0][1]).toEqual({ body: { patternIds: [A, C, B] } });
    expect(await screen.findByRole('status')).toHaveTextContent(/^Saved\.$/);
  });

  it('shows why the server refused a new default, keeping the order to change', async () => {
    const user = userEvent.setup();
    put.mockRejectedValueOnce(
      new APIClientError('The pattern cannot be a sound’s default', 'VALIDATION_ERROR', 400, {
        errors: [{ path: 'patternIds.0', message: 'A default cannot end in rests' }],
      })
    );
    render(<SoundPatternsEditor sound={SOUND} />);

    const researched = screen.getByRole('link', { name: 'Researched' }).closest('li')!;
    await user.click(within(researched).getByRole('button', { name: 'Make default' }));
    await user.click(saveOrder());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The pattern cannot be a sound’s default');
    expect(alert).toHaveTextContent('A default cannot end in rests');
    expect(names()).toEqual(['Researched', 'The riff', 'Broken']);
    expect(saveOrder()).toBeEnabled();
  });
});
