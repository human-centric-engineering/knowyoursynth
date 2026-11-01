// @vitest-environment happy-dom

/**
 * PatternForm (`f-pattern-library` t-126): one library pattern's fields and its notes in the sequencer module. Save
 * sends only what changed through the admin API; a refusal lands on the fields it names.
 *
 * The API client is mocked; the sequencer, the pattern model and the labels are real.
 *
 * @see components/app/admin/patterns/pattern-form.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PatternForm } from '@/components/app/admin/patterns/pattern-form';
import { APIClientError, apiClient } from '@/lib/api/client';
import type { LibraryPatternChoices } from '@/lib/app/patterns/library-edit';
import { adminLibraryPattern } from '@/tests/helpers/admin-library-pattern';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiClient: { patch: vi.fn() },
}));
vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const CHOICES: LibraryPatternChoices = {
  synths: [{ id: 'model-d', name: 'Model D', maker: 'Moog' }],
  artists: [{ id: 'kraftwerk', name: 'Kraftwerk' }],
  songs: [
    {
      id: 'the-model',
      title: 'The Model',
      parts: [{ id: 'part-bass', on: 'Minimoog (the bass)' }],
    },
    { id: 'no-parts', title: 'No parts', parts: [] },
  ],
};

const patch = vi.mocked(apiClient.patch);
/** The body of the last save. */
const sent = () => (patch.mock.calls.at(-1)?.[1] as { body: Record<string, unknown> }).body;
const save = () => screen.getByRole('button', { name: 'Save' });
const stepKeys = () =>
  within(screen.getByRole('group', { name: /^Steps of part/ })).getAllByRole('button');

beforeEach(() => {
  patch.mockReset();
  // The server's answer: the pattern as it stored it.
  patch.mockImplementation(async (_url, options) =>
    adminLibraryPattern({
      ...(options?.body as object),
      editedAt: '2026-11-01T00:00:00.000Z',
    })
  );
});

describe('PatternForm', () => {
  it('saves only what changed, through the admin API, and says the default’s riff follows', async () => {
    const user = userEvent.setup();
    render(<PatternForm pattern={adminLibraryPattern()} choices={CHOICES} />);

    expect(screen.getByLabelText('Name')).toHaveValue('Funk bass');
    expect(screen.getByRole('combobox', { name: /^Role/ })).toHaveValue('bass_line');
    expect(save()).toBeDisabled();

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Funk line');
    await user.selectOptions(screen.getByRole('combobox', { name: /^Role/ }), 'lead_line');
    expect(screen.getByText(/Saving rewrites the riff of the patch/)).toBeInTheDocument();
    await user.click(save());

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.calls[0][0]).toBe('/api/v1/admin/library-patterns/cpat000000000000000000001');
    expect(sent()).toEqual({ name: 'Funk line', role: 'lead_line' });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The riff of the patch it is the default of now plays it.'
    );
    expect(save()).toBeDisabled();
  });

  it('sends the notes edited in the sequencer as the whole pattern', async () => {
    const user = userEvent.setup();
    render(<PatternForm pattern={adminLibraryPattern()} choices={CHOICES} />);

    expect(stepKeys()[0]).toHaveAttribute('aria-label', 'Step 1: C3, on');
    // The first step is the chosen one, so a press turns it off.
    await user.click(stepKeys()[0]);
    expect(stepKeys()[0]).toHaveAttribute('aria-label', 'Step 1: C3, off');
    await user.click(save());

    const body = sent();
    expect(Object.keys(body)).toEqual(['pattern']);
    const pattern = body.pattern as { parts: { steps: { on: boolean }[] }[] };
    expect(pattern.parts[0].steps[0].on).toBe(false);
    expect(pattern.parts[0].steps[2].on).toBe(true);
  });

  it('links Inspired by to a work and its part, keeping each kind’s choice while another is shown', async () => {
    const user = userEvent.setup();
    render(<PatternForm pattern={adminLibraryPattern()} choices={CHOICES} />);

    expect(screen.getByLabelText('Synth')).toHaveValue('model-d');
    await user.selectOptions(screen.getByLabelText('Kind'), 'work');
    expect(screen.getByLabelText('Part')).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Work'), 'the-model');
    await user.selectOptions(screen.getByLabelText('Part'), 'part-bass');
    await user.selectOptions(screen.getByLabelText('Kind'), 'genre');
    await user.type(screen.getByLabelText('Genre'), 'Electro');
    await user.selectOptions(screen.getByLabelText('Kind'), 'work');
    expect(screen.getByLabelText('Part')).toHaveValue('part-bass');
    await user.click(save());

    expect(sent()).toEqual({
      inspiredBy: { kind: 'work', songId: 'the-model', partId: 'part-bass' },
    });
  });

  it('adds a source and a tempo range for a transcribed pattern', async () => {
    const user = userEvent.setup();
    render(<PatternForm pattern={adminLibraryPattern()} choices={CHOICES} />);

    await user.selectOptions(screen.getByRole('combobox', { name: /^Fidelity/ }), 'transcribed');
    await user.click(screen.getByRole('button', { name: 'Add a source' }));
    const source = screen.getByRole('group', { name: 'Source 1' });
    await user.selectOptions(within(source).getByLabelText('Type'), 'score');
    await user.type(within(source).getByLabelText('Citation'), 'Kraftwerk songbook, 1981');
    await user.clear(within(source).getByLabelText('Checked'));
    await user.type(within(source).getByLabelText('Checked'), '2026-10-31');
    await user.type(screen.getByLabelText('Slowest bpm'), '100');
    await user.type(screen.getByLabelText('Fastest bpm'), '140');
    await user.click(save());

    expect(sent()).toEqual({
      fidelity: 'transcribed',
      tempo: { min: 100, max: 140 },
      sources: [{ type: 'score', citation: 'Kraftwerk songbook, 1981', checkedAt: '2026-10-31' }],
    });
  });

  it('sends no tempo range when both are emptied, and a source taken out', async () => {
    const user = userEvent.setup();
    const source = { type: 'by_ear' as const, citation: 'By ear', checkedAt: '2026-10-31' };
    render(
      <PatternForm
        pattern={adminLibraryPattern({ tempo: { min: 100, max: 140 }, sources: [source] })}
        choices={CHOICES}
      />
    );

    expect(screen.getByLabelText('Slowest bpm')).toHaveValue('100');
    await user.clear(screen.getByLabelText('Slowest bpm'));
    await user.clear(screen.getByLabelText('Fastest bpm'));
    await user.click(screen.getByRole('button', { name: 'Remove source 1' }));
    await user.click(save());

    expect(sent()).toEqual({ tempo: null, sources: [] });
  });

  it('shows each problem the server names on its field, and the refusal’s message', async () => {
    const user = userEvent.setup();
    patch.mockRejectedValueOnce(
      new APIClientError('The pattern cannot be saved as it is', 'VALIDATION_ERROR', 400, {
        errors: [
          { path: 'inspiredBy', message: 'A transcribed pattern is inspired by a work' },
          { path: 'sources', message: 'A transcribed pattern lists its sources' },
          { path: 'elsewhere', message: 'Something no field holds' },
        ],
      })
    );
    render(<PatternForm pattern={adminLibraryPattern()} choices={CHOICES} />);

    await user.selectOptions(screen.getByRole('combobox', { name: /^Fidelity/ }), 'transcribed');
    await user.click(save());

    const refused = await screen.findByText('The pattern cannot be saved as it is');
    expect(refused.closest('[role="alert"]')).toHaveTextContent('Something no field holds');
    const inspired = screen.getByRole('group', { name: /^Inspired by/ });
    expect(
      within(inspired).getByText('A transcribed pattern is inspired by a work')
    ).toBeInTheDocument();
    const sources = screen.getByRole('group', { name: /^Sources/ });
    expect(
      within(sources).getByText('A transcribed pattern lists its sources')
    ).toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it('lists the patches the pattern is on, each linking to its order', () => {
    render(<PatternForm pattern={adminLibraryPattern()} choices={CHOICES} />);
    expect(screen.getByRole('link', { name: 'Funk bass' })).toHaveAttribute(
      'href',
      '/admin/synths/patterns/sounds/model-d/funk-bass'
    );
    expect(screen.getByText('Default')).toBeInTheDocument();
  });
});
