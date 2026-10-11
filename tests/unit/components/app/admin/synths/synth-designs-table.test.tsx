// @vitest-environment happy-dom

/**
 * SynthDesignsTable (D11, `f-panel-designs` t-28) — an admin switches a synth between the neutral and faithful designs
 * through `PATCH /api/v1/admin/synths/[id]/design`, recording the maker's approval when switching to faithful.
 *
 * @see components/app/admin/synths/synth-designs-table.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SharedSettingsAccessProvider } from '@/components/admin/shared-settings-access';
import { SynthDesignsTable } from '@/components/app/admin/synths/synth-designs-table';
import { apiClient, APIClientError } from '@/lib/api/client';
import type { AdminSynthDesign } from '@/lib/app/catalogue/designs';

vi.mock('@/lib/api/client', () => ({
  apiClient: { patch: vi.fn(), post: vi.fn() },
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

const patch = vi.mocked(apiClient.patch);

function synth(overrides: Partial<AdminSynthDesign> = {}): AdminSynthDesign {
  return {
    id: 'model-d',
    name: 'Model D',
    maker: 'Moog',
    listed: true,
    order: 1,
    playable: true,
    design: 'neutral',
    approval: null,
    ...overrides,
  };
}

const APPROVAL = {
  approvedBy: 'Jane Doe',
  approvedAt: '2026-10-03',
  note: 'Email, vendors folder',
};

const row = (id: string) => screen.getByTestId(`synth-row-${id}`);

beforeEach(() => {
  patch.mockReset();
});

describe('the list', () => {
  it('shows every synth it is given, listed or not, with its design and approval', () => {
    render(
      <SynthDesignsTable
        synths={[
          synth({ design: 'faithful', approval: APPROVAL }),
          synth({ id: '2-xm', name: '2-XM', maker: 'Arp', listed: false, playable: false }),
        ]}
      />
    );

    const moog = within(row('model-d'));
    expect(moog.getByRole('link', { name: 'Moog Model D' })).toHaveAttribute(
      'href',
      '/synths/model-d'
    );
    expect(moog.getByText('Listed')).toBeInTheDocument();
    expect(moog.getByText('Faithful')).toBeInTheDocument();
    expect(moog.getByText('Jane Doe · 2026-10-03')).toBeInTheDocument();
    expect(moog.getByText('Email, vendors folder')).toBeInTheDocument();

    // An unlisted synth has no public page, so its name is not a link.
    const arp = within(row('2-xm'));
    expect(arp.queryByRole('link')).not.toBeInTheDocument();
    expect(arp.getByText('Arp 2-XM')).toBeInTheDocument();
    expect(arp.getByText('Unlisted')).toBeInTheDocument();
    expect(arp.getByText('Not built')).toBeInTheDocument();
    expect(arp.getByText('Neutral')).toBeInTheDocument();
    expect(arp.getByText('None recorded')).toBeInTheDocument();
  });

  it('says so when the catalogue is empty', () => {
    render(<SynthDesignsTable synths={[]} />);
    expect(screen.getByText('The catalogue has no synths yet.')).toBeInTheDocument();
  });
});

describe('switching to faithful', () => {
  it('sends the approval it asks for, and shows the saved design', async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue(synth({ design: 'faithful', approval: { ...APPROVAL, note: null } }));
    render(<SynthDesignsTable synths={[synth()]} />);

    await user.click(screen.getByRole('button', { name: 'Switch Moog Model D to faithful' }));
    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/Approved by/, { selector: 'input' }),
      '  Jane Doe '
    );
    await user.type(
      within(dialog).getByLabelText(/Date approved/, { selector: 'input' }),
      '2026-10-03'
    );
    await user.click(within(dialog).getByRole('button', { name: 'Switch to faithful' }));

    expect(patch).toHaveBeenCalledWith('/api/v1/admin/synths/model-d/design', {
      body: {
        design: 'faithful',
        approval: { approvedBy: 'Jane Doe', approvedAt: '2026-10-03', note: null },
      },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(row('model-d')).getByText('Faithful')).toBeInTheDocument();
    expect(within(row('model-d')).getByText('Jane Doe · 2026-10-03')).toBeInTheDocument();
  });

  it('cannot be sent without an approver and a date', async () => {
    const user = userEvent.setup();
    render(<SynthDesignsTable synths={[synth()]} />);

    await user.click(screen.getByRole('button', { name: 'Switch Moog Model D to faithful' }));
    const dialog = screen.getByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Switch to faithful' });
    expect(submit).toBeDisabled();

    await user.type(
      within(dialog).getByLabelText(/Approved by/, { selector: 'input' }),
      'Jane Doe'
    );
    expect(submit).toBeDisabled();
    await user.type(
      within(dialog).getByLabelText(/Date approved/, { selector: 'input' }),
      '2026-10-03'
    );
    expect(submit).toBeEnabled();

    await user.clear(within(dialog).getByLabelText(/Approved by/, { selector: 'input' }));
    await user.type(within(dialog).getByLabelText(/Approved by/, { selector: 'input' }), '   ');
    expect(submit).toBeDisabled();
    expect(patch).not.toHaveBeenCalled();
  });

  it('starts from the approval already recorded, and sends the note as written', async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue(synth({ design: 'faithful', approval: APPROVAL }));
    render(<SynthDesignsTable synths={[synth({ approval: APPROVAL })]} />);

    await user.click(screen.getByRole('button', { name: 'Switch Moog Model D to faithful' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/Approved by/, { selector: 'input' })).toHaveValue(
      'Jane Doe'
    );
    expect(within(dialog).getByLabelText(/Date approved/, { selector: 'input' })).toHaveValue(
      '2026-10-03'
    );
    expect(within(dialog).getByLabelText(/Note/, { selector: 'textarea' })).toHaveValue(
      'Email, vendors folder'
    );
    await user.click(within(dialog).getByRole('button', { name: 'Switch to faithful' }));

    expect(patch).toHaveBeenCalledWith('/api/v1/admin/synths/model-d/design', {
      body: { design: 'faithful', approval: APPROVAL },
    });
  });

  it("shows the API's refusal in the dialog and keeps what was typed", async () => {
    const user = userEvent.setup();
    patch.mockRejectedValue(
      new APIClientError('Invalid request body', 'VALIDATION_ERROR', 400, {
        errors: [
          { path: 'approval.approvedAt', message: 'An approval cannot be dated in the future' },
        ],
      })
    );
    render(<SynthDesignsTable synths={[synth()]} />);

    await user.click(screen.getByRole('button', { name: 'Switch Moog Model D to faithful' }));
    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/Approved by/, { selector: 'input' }),
      'Jane Doe'
    );
    await user.type(
      within(dialog).getByLabelText(/Date approved/, { selector: 'input' }),
      '2026-10-03'
    );
    await user.click(within(dialog).getByRole('button', { name: 'Switch to faithful' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'An approval cannot be dated in the future'
    );
    expect(within(dialog).getByLabelText(/Approved by/, { selector: 'input' })).toHaveValue(
      'Jane Doe'
    );
    expect(within(dialog).getByRole('button', { name: 'Switch to faithful' })).toBeEnabled();
    expect(within(row('model-d')).getByText('Neutral')).toBeInTheDocument();
  });

  it("shows the approval rule's refusal by its field message", async () => {
    const user = userEvent.setup();
    patch.mockRejectedValue(
      new APIClientError(
        "Showing the maker's marks needs a recorded approval",
        'VALIDATION_ERROR',
        400,
        {
          approval: ['Record who approved it and when before choosing the faithful design'],
        }
      )
    );
    render(<SynthDesignsTable synths={[synth()]} />);

    await user.click(screen.getByRole('button', { name: 'Switch Moog Model D to faithful' }));
    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/Approved by/, { selector: 'input' }),
      'Jane Doe'
    );
    await user.type(
      within(dialog).getByLabelText(/Date approved/, { selector: 'input' }),
      '2026-10-03'
    );
    await user.click(within(dialog).getByRole('button', { name: 'Switch to faithful' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Record who approved it and when before choosing the faithful design'
    );
  });
});

describe('switching to neutral', () => {
  it('sends no approval, and the approval stays on the row', async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue(synth({ design: 'neutral', approval: APPROVAL }));
    render(<SynthDesignsTable synths={[synth({ design: 'faithful', approval: APPROVAL })]} />);

    await user.click(screen.getByRole('button', { name: 'Switch Moog Model D to neutral' }));

    expect(patch).toHaveBeenCalledWith('/api/v1/admin/synths/model-d/design', {
      body: { design: 'neutral' },
    });
    expect(within(row('model-d')).getByText('Neutral')).toBeInTheDocument();
    expect(within(row('model-d')).getByText('Jane Doe · 2026-10-03')).toBeInTheDocument();
  });

  it('shows a refusal on the row it came from', async () => {
    const user = userEvent.setup();
    patch.mockRejectedValue(new APIClientError('Synth not found', 'NOT_FOUND', 404));
    render(<SynthDesignsTable synths={[synth({ design: 'faithful', approval: APPROVAL })]} />);

    await user.click(screen.getByRole('button', { name: 'Switch Moog Model D to neutral' }));

    expect(within(row('model-d')).getByRole('alert')).toHaveTextContent('Synth not found');
    expect(within(row('model-d')).getByText('Faithful')).toBeInTheDocument();
  });

  it('keeps a row disabled while its own change is in flight, when another row finishes first', async () => {
    const user = userEvent.setup();
    let finishFirst!: (value: AdminSynthDesign) => void;
    patch
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockImplementationOnce(() => new Promise(() => {}));
    const odyssey = synth({
      id: 'odyssey',
      name: 'Odyssey',
      maker: 'Arp',
      design: 'faithful',
      approval: APPROVAL,
    });
    render(
      <SynthDesignsTable synths={[synth({ design: 'faithful', approval: APPROVAL }), odyssey]} />
    );

    await user.click(screen.getByRole('button', { name: 'Switch Moog Model D to neutral' }));
    await user.click(screen.getByRole('button', { name: 'Switch Arp Odyssey to neutral' }));
    finishFirst(synth({ design: 'neutral', approval: APPROVAL }));

    expect(await within(row('model-d')).findByText('Neutral')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch Arp Odyssey to neutral' })).toBeDisabled();
    expect(patch).toHaveBeenCalledTimes(2);
  });
});

it('cannot change anything where shared settings are read-only', () => {
  render(
    <SharedSettingsAccessProvider readOnly canSwitch={false}>
      <SynthDesignsTable
        synths={[
          synth(),
          synth({
            id: 'odyssey',
            name: 'Odyssey',
            maker: 'Arp',
            design: 'faithful',
            approval: APPROVAL,
          }),
        ]}
      />
    </SharedSettingsAccessProvider>
  );

  expect(screen.getByRole('button', { name: 'Switch Moog Model D to faithful' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Switch Arp Odyssey to neutral' })).toBeDisabled();
  expect(screen.getByText(/changes save from the install organisation/)).toBeInTheDocument();
});
