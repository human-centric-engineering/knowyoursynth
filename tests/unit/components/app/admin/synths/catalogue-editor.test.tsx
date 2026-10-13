// @vitest-environment happy-dom

/**
 * The catalogue editor's pages (`f-catalogue-admin` t-31): reordering and hiding synths, reordering a library, editing
 * a sound and its lesson, and a refused save landing on the fields the server names.
 *
 * @see components/app/admin/synths/
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SharedSettingsAccessProvider } from '@/components/admin/shared-settings-access';
import { CatalogueTable } from '@/components/app/admin/synths/catalogue-table';
import { NotesEditor } from '@/components/app/admin/synths/notes-editor';
import { placeProblems } from '@/components/app/admin/synths/problems';
import { SoundForm } from '@/components/app/admin/synths/sound-form';
import { SoundLibrary } from '@/components/app/admin/synths/sound-library';
import { apiClient, APIClientError } from '@/lib/api/client';
import type { AdminNote, AdminSound, AdminSynth } from '@/lib/app/catalogue/edit';

vi.mock('@/lib/api/client', () => ({
  apiClient: { put: vi.fn(), patch: vi.fn(), post: vi.fn() },
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

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const put = vi.mocked(apiClient.put);
const patch = vi.mocked(apiClient.patch);
const post = vi.mocked(apiClient.post);

beforeEach(() => {
  put.mockReset();
  patch.mockReset();
  post.mockReset();
  push.mockReset();
});

/** A form field by its label; the label also names its ⓘ button, so ask for the input. */
const INPUT = { selector: 'input, textarea, select' };

/** A 400 in the shape every catalogue write refuses with. */
const refusal = (message: string, errors: { path: string; message: string }[]) =>
  new APIClientError(message, 'VALIDATION_ERROR', 400, { errors });

function synth(overrides: Partial<AdminSynth> = {}): AdminSynth {
  return {
    id: 'model-d',
    name: 'Model D',
    maker: 'Moog',
    listed: true,
    order: 0,
    playable: true,
    design: 'neutral',
    approval: null,
    year: 1970,
    heritage: 'Monophonic',
    summary: 'The classic.',
    editedAt: null,
    counts: { sounds: 3, notes: 2, lineage: true },
    ...overrides,
  };
}

const SYNTHS = [
  synth(),
  synth({ id: '2-xm', name: '2-XM', maker: 'Arp', order: 1 }),
  synth({ id: 'pro-1', name: 'Pro-One', maker: 'Sequential', order: 2, listed: false }),
];

const rowOrder = () =>
  screen
    .getAllByTestId(/^catalogue-row-/)
    .map((r) => r.dataset.testid?.replace('catalogue-row-', ''));

describe('the catalogue list', () => {
  it('saves the moved order as one list of every synth, and keeps it once saved', async () => {
    const user = userEvent.setup();
    put.mockResolvedValue({ ids: ['2-xm', 'model-d', 'pro-1'] });
    render(<CatalogueTable synths={SYNTHS} />);

    const save = screen.getByRole('button', { name: 'Save order' });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Move Arp 2-XM up' }));
    expect(rowOrder()).toEqual(['2-xm', 'model-d', 'pro-1']);
    expect(screen.getByText('The new order is not saved yet.')).toBeInTheDocument();

    await user.click(save);

    expect(put).toHaveBeenCalledWith('/api/v1/admin/synths/order', {
      body: { ids: ['2-xm', 'model-d', 'pro-1'] },
    });
    expect(rowOrder()).toEqual(['2-xm', 'model-d', 'pro-1']);
    expect(screen.queryByText('The new order is not saved yet.')).not.toBeInTheDocument();
    expect(save).toBeDisabled();
  });

  it('keeps a listed change that lands while the order is saving', async () => {
    const user = userEvent.setup();
    let answerOrder: (value: { ids: string[] }) => void = () => {};
    put.mockReturnValue(new Promise((resolve) => (answerOrder = resolve)));
    patch.mockResolvedValue({ id: 'model-d', listed: false });
    render(<CatalogueTable synths={SYNTHS} />);

    await user.click(screen.getByRole('button', { name: 'Move Arp 2-XM up' }));
    await user.click(screen.getByRole('button', { name: 'Save order' }));
    const listed = screen.getByRole('switch', { name: 'List Moog Model D' });
    await user.click(listed);
    expect(listed).not.toBeChecked();

    answerOrder({ ids: ['2-xm', 'model-d', 'pro-1'] });

    expect(await screen.findByRole('button', { name: 'Save order' })).toBeDisabled();
    expect(rowOrder()).toEqual(['2-xm', 'model-d', 'pro-1']);
    expect(screen.getByRole('switch', { name: 'List Moog Model D' })).not.toBeChecked();
  });

  it('puts the saved order back when the moves are undone, sending nothing', async () => {
    const user = userEvent.setup();
    render(<CatalogueTable synths={SYNTHS} />);

    await user.click(screen.getByRole('button', { name: 'Move Moog Model D down' }));
    expect(rowOrder()).toEqual(['2-xm', 'model-d', 'pro-1']);
    await user.click(screen.getByRole('button', { name: 'Undo moves' }));

    expect(rowOrder()).toEqual(['model-d', '2-xm', 'pro-1']);
    expect(put).not.toHaveBeenCalled();
  });

  it('hides a synth through its listed switch, and shows what the server saved', async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue({ id: 'model-d', listed: false });
    render(<CatalogueTable synths={SYNTHS} />);

    const listed = screen.getByRole('switch', { name: 'List Moog Model D' });
    expect(listed).toBeChecked();
    await user.click(listed);

    expect(patch).toHaveBeenCalledWith('/api/v1/admin/synths/model-d', { body: { listed: false } });
    expect(screen.getByRole('switch', { name: 'List Moog Model D' })).not.toBeChecked();
  });

  it('keeps a synth listed and says why when the server refuses to hide it', async () => {
    const user = userEvent.setup();
    patch.mockRejectedValue(new APIClientError('Synth not found', 'NOT_FOUND', 404));
    render(<CatalogueTable synths={SYNTHS} />);

    await user.click(screen.getByRole('switch', { name: 'List Moog Model D' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Synth not found');
    expect(screen.getByRole('switch', { name: 'List Moog Model D' })).toBeChecked();
  });

  it('links each synth to its editor', () => {
    render(<CatalogueTable synths={SYNTHS} />);
    expect(screen.getByRole('link', { name: 'Edit Arp 2-XM' })).toHaveAttribute(
      'href',
      '/admin/synths/catalogue/2-xm'
    );
  });

  it('disables every change for an admin acting for another org', () => {
    render(
      <SharedSettingsAccessProvider readOnly canSwitch={false}>
        <CatalogueTable synths={SYNTHS} />
      </SharedSettingsAccessProvider>
    );
    expect(screen.getByRole('switch', { name: 'List Moog Model D' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Arp 2-XM up' })).toBeDisabled();
  });
});

// ─── A synth's library ───────────────────────────────────────────────────────

const STORED = {
  id: 'funk-bass',
  name: 'Rubber Funk Bass',
  ref: 'In the style of Parliament — "Flash Light"',
  artist: 'Bernie Worrell',
  tags: ['bass', 'funk'],
  level: 1,
  blurb: 'Fat, round synth bass.',
  how: 'Three saws through a closing filter.',
  phrase: { bpm: 104, loop: true, steps: [[0, 36, 0.4]] },
  steps: [
    {
      title: 'Stack three sawtooths',
      module: 'osc',
      why: 'Thick raw tone.',
      set: { 'osc1.range': '16' },
    },
    {
      title: 'Patch the filter',
      module: 'filter',
      why: 'Shape it.',
      set: { cutoff: 2 },
      cables: [['env.out', 'vcf.in']],
    },
  ],
  context: { cutoff: 'Almost closed' },
  tweaks: [{ id: 'cutoff', try: 'Open it', hear: 'Brighter' }],
};

function adminSound(slug: string, name: string, overrides: Partial<AdminSound> = {}): AdminSound {
  return {
    slug,
    definitionVersion: 1,
    order: 0,
    editedAt: null,
    sound: { ...STORED, id: slug, name },
    problems: [],
    ...overrides,
  };
}

describe("a synth's library", () => {
  it('saves the moved order of its sounds', async () => {
    const user = userEvent.setup();
    put.mockResolvedValue({ ids: ['pad', 'bass'] });
    render(
      <SoundLibrary
        synthId="model-d"
        canAdd
        sounds={[adminSound('bass', 'Bass'), adminSound('pad', 'Pad', { order: 1 })]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Move Pad up' }));
    await user.click(screen.getByRole('button', { name: 'Save order' }));

    expect(put).toHaveBeenCalledWith('/api/v1/admin/synths/model-d/sounds/order', {
      body: { ids: ['pad', 'bass'] },
    });
  });

  it('says why the public page leaves a sound out, and links every sound to its editor', () => {
    render(
      <SoundLibrary
        synthId="model-d"
        canAdd={false}
        sounds={[
          adminSound('bass', 'Bass', {
            problems: [{ path: 'definitionVersion', message: 'Made on definition version 1' }],
          }),
        ]}
      />
    );

    const row = within(screen.getByTestId('sound-row-bass'));
    expect(row.getByText('Not served')).toBeInTheDocument();
    expect(row.getByText('Made on definition version 1')).toBeInTheDocument();
    expect(row.getByRole('link', { name: 'Edit Bass' })).toHaveAttribute(
      'href',
      '/admin/synths/catalogue/model-d/sounds/bass'
    );
    expect(screen.queryByRole('link', { name: 'Add a sound' })).not.toBeInTheDocument();
  });
});

// ─── A sound and its lesson ──────────────────────────────────────────────────

/** The body a PATCH of STORED, unchanged, sends: every field but the id. */
const { id: _id, ...UNCHANGED } = STORED;

describe('editing a sound', () => {
  it("sends the whole sound, a step's values and cables parsed from their JSON", async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue({ ...STORED, name: 'Rubber Bass' });
    render(<SoundForm synthId="model-d" mode="edit" sound={STORED} />);

    const name = screen.getByLabelText(/^Name/, INPUT);
    await user.clear(name);
    await user.type(name, 'Rubber Bass');
    const values = within(screen.getByTestId('step-0')).getByLabelText(/Values \(JSON\)/, INPUT);
    await user.clear(values);
    // `{` and `[` open key descriptors in user-event; the doubled ones type the character.
    await user.type(values, '{{"osc1.range": "8"}');
    await user.click(screen.getByRole('button', { name: 'Save sound' }));

    expect(patch).toHaveBeenCalledWith('/api/v1/admin/synths/model-d/sounds/funk-bass', {
      body: {
        ...UNCHANGED,
        name: 'Rubber Bass',
        steps: [{ ...STORED.steps[0], set: { 'osc1.range': '8' } }, STORED.steps[1]],
      },
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/, INPUT)).toHaveValue('Rubber Bass');
  });

  it('removes a step, and leaves out the values of a step whose JSON is emptied', async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue(STORED);
    render(<SoundForm synthId="model-d" mode="edit" sound={STORED} />);

    await user.click(screen.getByRole('button', { name: 'Remove step 1' }));
    await user.clear(within(screen.getByTestId('step-0')).getByLabelText(/Values \(JSON\)/, INPUT));
    await user.click(screen.getByRole('button', { name: 'Save sound' }));

    const [, options] = patch.mock.calls[0];
    expect(options?.body).toMatchObject({
      steps: [
        {
          title: 'Patch the filter',
          module: 'filter',
          why: 'Shape it.',
          cables: [['env.out', 'vcf.in']],
        },
      ],
    });
    expect((options?.body as { steps: object[] }).steps[0]).not.toHaveProperty('set');
  });

  it("puts each of the server's problems on the field it names, and lists what no field claims", async () => {
    const user = userEvent.setup();
    patch.mockRejectedValue(
      refusal('The sound does not fit model-d', [
        { path: 'steps.1.set.cutoff', message: 'cutoff must be between 0 and 10' },
        { path: 'steps.1.cables.0', message: 'vcf.in is not a jack on model-d' },
        { path: 'tweaks.0.id', message: 'Tweak names cutoff, which model-d does not have' },
        { path: 'context.cutoff', message: 'Context names cutoff, which model-d does not have' },
        { path: 'name', message: 'Required' },
        { path: 'sound', message: 'Something about the whole sound' },
      ])
    );
    render(<SoundForm synthId="model-d" mode="edit" sound={STORED} />);

    await user.click(screen.getByRole('button', { name: 'Save sound' }));

    const step2 = within(screen.getByTestId('step-1'));
    expect(await step2.findByText('cutoff must be between 0 and 10')).toBeInTheDocument();
    expect(step2.getByLabelText(/Values \(JSON\)/, INPUT)).toHaveAttribute('aria-invalid', 'true');
    expect(step2.getByText('vcf.in is not a jack on model-d')).toBeInTheDocument();
    expect(step2.getByLabelText(/Cables \(JSON\)/, INPUT)).toHaveAttribute('aria-invalid', 'true');
    // Not on the step the problem is not about.
    expect(
      within(screen.getByTestId('step-0')).queryByText('cutoff must be between 0 and 10')
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Control$/, INPUT)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Control 1')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Name/, INPUT)).toHaveAttribute('aria-invalid', 'true');

    const summary = screen.getByText('The sound does not fit model-d').closest('[role="alert"]');
    expect(summary).toHaveTextContent('Something about the whole sound');
    expect(summary).not.toHaveTextContent('cutoff must be between 0 and 10');
  });

  it('does not send JSON that does not parse, and says where it is', async () => {
    const user = userEvent.setup();
    render(<SoundForm synthId="model-d" mode="edit" sound={STORED} />);

    const cables = within(screen.getByTestId('step-1')).getByLabelText(/Cables \(JSON\)/, INPUT);
    await user.clear(cables);
    await user.type(cables, '[[oops');
    await user.click(screen.getByRole('button', { name: 'Save sound' }));

    expect(patch).not.toHaveBeenCalled();
    expect(within(screen.getByTestId('step-1')).getByText(/^Not valid JSON/)).toBeInTheDocument();
  });

  it('adds a new sound with its id, then opens its editor', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ ...STORED, id: 'wobble' });
    render(<SoundForm synthId="model-d" mode="new" />);

    await user.type(screen.getByLabelText(/^Id/, INPUT), 'wobble');
    await user.type(screen.getByLabelText(/^Name/, INPUT), 'Wobble');
    await user.click(screen.getByRole('button', { name: 'Add sound' }));

    expect(post).toHaveBeenCalledWith('/api/v1/admin/synths/model-d/sounds', {
      body: expect.objectContaining({
        id: 'wobble',
        name: 'Wobble',
        level: 1,
        steps: [],
        // A phrase is refused without a note, so the starter has one.
        phrase: { bpm: 100, loop: true, steps: [[0, 48, 1]] },
      }),
    });
    expect(push).toHaveBeenCalledWith('/admin/synths/catalogue/model-d/sounds/wobble');
  });

  it('refuses to show a stored sound in a shape it cannot read, rather than dropping its steps', () => {
    render(<SoundForm synthId="model-d" mode="edit" sound={{ ...STORED, steps: 'nope' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('cannot be edited here');
    expect(screen.queryByRole('button', { name: 'Save sound' })).not.toBeInTheDocument();
  });
});

// ─── Notes ───────────────────────────────────────────────────────────────────

const note = (overrides: Partial<AdminNote>): AdminNote => ({
  id: 'n1',
  kind: 'UNUSUAL',
  target: 'osc1.range',
  title: null,
  text: 'Footage, not octaves.',
  order: 0,
  editedAt: null,
  ...overrides,
});

describe('notes', () => {
  it("shows a refused new note's problem on its target", async () => {
    const user = userEvent.setup();
    post.mockRejectedValue(
      refusal('model-d has no control, jack or area called nope', [
        { path: 'target', message: 'nope is not on model-d' },
      ])
    );
    render(<NotesEditor synthId="model-d" notes={[]} sharedLimits={[]} canAdd />);

    await user.type(screen.getByLabelText(/Control, jack or area/, INPUT), 'nope');
    await user.type(screen.getByLabelText('Text'), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Add note' }));

    expect(await screen.findByText('nope is not on model-d')).toBeInTheDocument();
    expect(screen.getByLabelText(/Control, jack or area/, INPUT)).toHaveAttribute(
      'aria-invalid',
      'true'
    );
  });

  it("saves a limit's title and text", async () => {
    const user = userEvent.setup();
    const limit = note({ id: 'lim', kind: 'LIMIT', target: null, title: 'No MIDI', text: 'None.' });
    patch.mockResolvedValue({
      ...limit,
      title: 'No MIDI in',
      editedAt: '2026-10-12T00:00:00.000Z',
    });
    render(<NotesEditor synthId="model-d" notes={[limit]} sharedLimits={[]} canAdd={false} />);

    const form = within(screen.getByTestId('note-lim'));
    await user.type(form.getByLabelText('Title'), ' in');
    await user.click(form.getByRole('button', { name: 'Save' }));

    expect(patch).toHaveBeenCalledWith('/api/v1/admin/synth-notes/lim', {
      body: { text: 'None.', title: 'No MIDI in' },
    });
    expect(await form.findByText('Edited')).toBeInTheDocument();
    // The card is named by the title just saved, not the one the page loaded with.
    expect(form.getByText('No MIDI in')).toBeInTheDocument();
    expect(form.queryByText('No MIDI')).not.toBeInTheDocument();
  });
});

describe('placeProblems', () => {
  it('gives a problem to the longest key its path starts with, and leaves the rest unplaced', () => {
    const placed = placeProblems(
      [
        { path: 'steps.1.set.cutoff', message: 'a' },
        { path: 'steps.10', message: 'b' },
        { path: 'steps', message: 'c' },
        { path: '', message: 'd' },
      ],
      ['steps', 'steps.1', 'steps.1.set']
    );
    expect(placed.at('steps.1.set')).toEqual(['a']);
    // `steps.10` is not inside `steps.1`.
    expect(placed.at('steps.1')).toEqual([]);
    expect(placed.at('steps')).toEqual(['b', 'c']);
    expect(placed.unplaced).toEqual([{ path: '', message: 'd' }]);
  });
});

// ─── Beyond the four the task names ──────────────────────────────────────────

describe("a synth's library, refused and undone", () => {
  const sounds = [adminSound('bass', 'Bass'), adminSound('pad', 'Pad', { order: 1 })];

  it('keeps the moved order and says why when the server refuses it, then undoes the moves', async () => {
    const user = userEvent.setup();
    put.mockRejectedValue(
      refusal('The order must list every sound', [{ path: 'ids', message: 'Missing lead' }])
    );
    render(<SoundLibrary synthId="model-d" canAdd sounds={sounds} />);

    await user.click(screen.getByRole('button', { name: 'Move Pad up' }));
    await user.click(screen.getByRole('button', { name: 'Save order' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The order must list every sound Missing lead'
    );
    const order = () => screen.getAllByTestId(/^sound-row-/).map((r) => r.dataset.testid);
    expect(order()).toEqual(['sound-row-pad', 'sound-row-bass']);

    await user.click(screen.getByRole('button', { name: 'Undo moves' }));
    expect(order()).toEqual(['sound-row-bass', 'sound-row-pad']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says a synth with no sounds has none, and marks an edited sound', () => {
    const { unmount } = render(<SoundLibrary synthId="model-d" canAdd sounds={[]} />);
    expect(screen.getByText('This synth has no sounds yet.')).toBeInTheDocument();
    unmount();

    render(
      <SoundLibrary
        synthId="model-d"
        canAdd
        sounds={[adminSound('bass', 'Bass', { editedAt: '2026-10-12T00:00:00.000Z' })]}
      />
    );
    expect(within(screen.getByTestId('sound-row-bass')).getByText('Edited')).toBeInTheDocument();
  });
});

describe('editing a sound, row by row', () => {
  it('adds a step, a control and a tweak, and moves a step', async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue(STORED);
    render(<SoundForm synthId="model-d" mode="edit" sound={STORED} />);

    await user.click(screen.getByRole('button', { name: 'Add a step' }));
    const step3 = within(screen.getByTestId('step-2'));
    await user.type(step3.getByLabelText('Title', INPUT), 'Add the envelope');
    await user.selectOptions(step3.getByLabelText('Module', INPUT), 'env');
    await user.type(step3.getByLabelText('Why', INPUT), 'Pluck.');
    await user.click(screen.getByRole('button', { name: 'Move step 3 up' }));

    await user.click(screen.getByRole('button', { name: 'Add a control' }));
    await user.type(screen.getByLabelText('Control 2'), 'resonance');
    await user.type(screen.getByLabelText('What control 2 is doing'), 'Low');

    await user.click(screen.getByRole('button', { name: 'Add a tweak' }));
    const tweakControls = screen.getAllByLabelText('Control', INPUT);
    await user.type(tweakControls[1], 'resonance');
    await user.type(screen.getAllByLabelText('Try', INPUT)[1], 'Raise it');
    await user.type(screen.getAllByLabelText('Hear', INPUT)[1], 'Squelch');

    await user.type(screen.getByLabelText(/^Tags/, INPUT), ', , classic');
    await user.selectOptions(screen.getByLabelText(/^Level/, INPUT), '2');
    await user.click(screen.getByRole('button', { name: 'Save sound' }));

    const body = patch.mock.calls[0][1]?.body as Record<string, unknown>;
    expect(body.steps).toEqual([
      STORED.steps[0],
      { title: 'Add the envelope', module: 'env', why: 'Pluck.' },
      STORED.steps[1],
    ]);
    expect(body.context).toEqual({ cutoff: 'Almost closed', resonance: 'Low' });
    expect(body.tweaks).toEqual([
      STORED.tweaks[0],
      { id: 'resonance', try: 'Raise it', hear: 'Squelch' },
    ]);
    expect(body.tags).toEqual(['bass', 'funk', 'classic']);
    expect(body.level).toBe(2);
  });

  it('removes a control and a tweak', async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue(STORED);
    render(<SoundForm synthId="model-d" mode="edit" sound={STORED} />);

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Remove tweak 1' }));
    await user.click(screen.getByRole('button', { name: 'Save sound' }));

    expect(patch.mock.calls[0][1]?.body).toMatchObject({ context: {}, tweaks: [] });
  });

  it('does not send a control listed twice, and says which', async () => {
    const user = userEvent.setup();
    render(<SoundForm synthId="model-d" mode="edit" sound={STORED} />);

    await user.click(screen.getByRole('button', { name: 'Add a control' }));
    await user.type(screen.getByLabelText('Control 2'), 'cutoff');
    await user.click(screen.getByRole('button', { name: 'Save sound' }));

    expect(patch).not.toHaveBeenCalled();
    expect(screen.getAllByText('cutoff is listed twice')).not.toHaveLength(0);
    expect(screen.getByLabelText('Control 2')).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not send a control row with no control id, and says so', async () => {
    const user = userEvent.setup();
    render(<SoundForm synthId="model-d" mode="edit" sound={STORED} />);

    await user.click(screen.getByRole('button', { name: 'Add a control' }));
    await user.click(screen.getByRole('button', { name: 'Add a control' }));
    await user.click(screen.getByRole('button', { name: 'Save sound' }));

    expect(patch).not.toHaveBeenCalled();
    expect(screen.getAllByText('Every control row needs a control id')).not.toHaveLength(0);
    expect(screen.queryByText(/is listed twice/)).not.toBeInTheDocument();
  });

  it("drops a refusal's problems once a step is removed, rather than leaving them on the wrong step", async () => {
    const user = userEvent.setup();
    patch.mockRejectedValue(
      refusal('The sound does not fit model-d', [
        { path: 'steps.1.set.cutoff', message: 'cutoff must be between 0 and 10' },
      ])
    );
    render(<SoundForm synthId="model-d" mode="edit" sound={STORED} />);

    await user.click(screen.getByRole('button', { name: 'Save sound' }));
    expect(await screen.findByText('cutoff must be between 0 and 10')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove step 1' }));

    // The step that was second is now first; the problem named index 1, which is no longer it.
    expect(screen.queryByText('cutoff must be between 0 and 10')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('step-0')).getByLabelText(/Values \(JSON\)/, INPUT)
    ).toHaveAttribute('aria-invalid', 'false');
  });

  it('says it could not save when the failure is not a refusal', async () => {
    const user = userEvent.setup();
    patch.mockRejectedValue(new Error('network'));
    render(<SoundForm synthId="model-d" mode="edit" sound={STORED} />);

    await user.click(screen.getByRole('button', { name: 'Save sound' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the sound. Try again.'
    );
  });

  it('keeps an unknown stored module selectable rather than dropping it', () => {
    render(
      <SoundForm
        synthId="model-d"
        mode="edit"
        sound={{ ...STORED, steps: [{ ...STORED.steps[0], module: 'wavefolder' }] }}
      />
    );
    expect(within(screen.getByTestId('step-0')).getByLabelText('Module', INPUT)).toHaveValue(
      'wavefolder'
    );
  });
});

describe('notes, beyond the first save', () => {
  it('adds a new unusual note to the list, trimming its target, and clears the form', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue(note({ id: 'n2', target: 'vcf.emphasis', text: 'Resonance.' }));
    render(<NotesEditor synthId="model-d" notes={[]} sharedLimits={[]} canAdd />);

    expect(screen.getByText('No unusual notes yet.')).toBeInTheDocument();
    const target = screen.getByLabelText(/Control, jack or area/, INPUT);
    await user.type(target, '  vcf.emphasis ');
    await user.type(screen.getByLabelText('Text'), 'Resonance.');
    await user.click(screen.getByRole('button', { name: 'Add note' }));

    expect(post).toHaveBeenCalledWith('/api/v1/admin/synths/model-d/notes', {
      body: { target: 'vcf.emphasis', text: 'Resonance.' },
    });
    expect(await screen.findByTestId('note-n2')).toHaveTextContent('Unusual on vcf.emphasis');
    expect(target).toHaveValue('');
  });

  it('says it could not add a note when the failure is not a refusal', async () => {
    const user = userEvent.setup();
    post.mockRejectedValue(new Error('network'));
    render(<NotesEditor synthId="model-d" notes={[]} sharedLimits={[]} canAdd />);

    await user.type(screen.getByLabelText(/Control, jack or area/, INPUT), 'osc1.range');
    await user.type(screen.getByLabelText('Text'), 'Hi');
    await user.click(screen.getByRole('button', { name: 'Add note' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not add the note. Try again.'
    );
  });

  it("saves an unusual note's text alone, and shows a refusal on it", async () => {
    const user = userEvent.setup();
    patch.mockRejectedValue(refusal('Invalid note', [{ path: 'text', message: 'Too long' }]));
    render(<NotesEditor synthId="model-d" notes={[note({})]} sharedLimits={[]} canAdd={false} />);

    const form = within(screen.getByTestId('note-n1'));
    expect(form.queryByLabelText('Title')).not.toBeInTheDocument();
    await user.type(form.getByLabelText('Text'), '!');
    await user.click(form.getByRole('button', { name: 'Save' }));

    expect(patch).toHaveBeenCalledWith('/api/v1/admin/synth-notes/n1', {
      body: { text: 'Footage, not octaves.!' },
    });
    expect(await form.findByText('Too long')).toBeInTheDocument();
    expect(form.getByLabelText('Text')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the intro, untitled limits and shared limits, each where it belongs', () => {
    render(
      <NotesEditor
        synthId="model-d"
        notes={[
          note({ id: 'intro', kind: 'LIMIT_INTRO', target: null, text: 'Left out:' }),
          note({ id: 'lim', kind: 'LIMIT', target: null, title: null, text: 'No MIDI.' }),
        ]}
        sharedLimits={[
          note({ id: 'shared', kind: 'LIMIT', target: null, title: 'Mono', text: 'One voice.' }),
        ]}
        canAdd={false}
      />
    );

    expect(screen.getByTestId('note-intro')).toHaveTextContent('Intro');
    expect(screen.getByTestId('note-lim')).toHaveTextContent('Limit');
    expect(screen.getByTestId('note-shared')).toHaveTextContent('Every panel');
    expect(screen.queryByText('This synth has no limits listed.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add note' })).not.toBeInTheDocument();
  });

  it('says a synth with no limits has none', () => {
    render(<NotesEditor synthId="model-d" notes={[]} sharedLimits={[]} canAdd={false} />);
    expect(screen.getByText('This synth has no limits listed.')).toBeInTheDocument();
  });
});
