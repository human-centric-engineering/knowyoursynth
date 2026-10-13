// @vitest-environment happy-dom

/**
 * CatalogueUpload (`f-catalogue-admin` t-33) — uploading one synth's content from the data page.
 *
 * Pins: the file goes to the chosen synth's content route exactly as it is, so the server keeps the admin's file; an
 * accepted upload shows its counts per table and refreshes the page; a refusal lists every problem the server named;
 * a file past the limit is refused here without a request.
 *
 * @see components/app/admin/synths/catalogue-upload.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CatalogueUpload } from '@/components/app/admin/synths/catalogue-upload';
import { apiClient, APIClientError } from '@/lib/api/client';
import type { UploadReport } from '@/lib/app/catalogue/upload';

const mockRefresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiClient: { post: vi.fn() },
}));
const post = vi.mocked(apiClient.post);

const SYNTHS = [
  { id: 'model-d', name: 'Model D' },
  { id: 'tb-303', name: 'TB-303' },
];

const REPORT: UploadReport = {
  sounds: { created: 2, updated: 1, unchanged: 5, edited: 1 },
  lineage: { created: 0, updated: 0, unchanged: 1, edited: 0 },
  notes: { created: 3, updated: 0, unchanged: 0, edited: 0 },
};

const jsonFile = (text: string, name = 'tb-303.content.json') =>
  new File([text], name, { type: 'application/json' });

async function choose(file: File, synth = 'TB-303') {
  const user = userEvent.setup();
  render(<CatalogueUpload synths={SYNTHS} />);
  await user.selectOptions(screen.getByLabelText('Synth'), synth);
  await user.upload(screen.getByLabelText(/Content file/), file);
  await user.click(screen.getByRole('button', { name: 'Upload' }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CatalogueUpload', () => {
  it('posts the file as it is to the chosen synth, shows the counts and refreshes the page', async () => {
    post.mockResolvedValue({ report: REPORT, file: { path: 'x', size: 1 } });
    const text = '{\n  "synth": "tb-303",  "version": 1,\n  "sounds": []\n}\n';

    await choose(jsonFile(text));

    expect(post).toHaveBeenCalledWith('/api/v1/admin/synths/tb-303/content', {
      options: { body: text },
    });
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Uploaded TB-303');
    const sounds = within(status).getByRole('row', { name: /Sounds/ });
    expect(
      within(sounds)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['2', '1', '5', '1']);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('lists every problem the server names when it refuses the file', async () => {
    post.mockRejectedValue(
      new APIClientError(
        'The file has 2 problem(s). Nothing was written.',
        'VALIDATION_ERROR',
        400,
        {
          errors: [
            { path: 'sounds.0.id', message: 'Bad Id is not a usable id' },
            { path: '', message: 'notes/tb-303.json has an unusual note on x' },
          ],
        }
      )
    );

    await choose(jsonFile('{}'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nothing was written');
    expect(
      within(alert)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual([
      'sounds.0.id: Bad Id is not a usable id',
      'notes/tb-303.json has an unusual note on x',
    ]);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('refuses a file past 2 MB without sending it', async () => {
    await choose(jsonFile(' '.repeat(2 * 1024 * 1024 + 1)));

    expect(await screen.findByRole('alert')).toHaveTextContent('larger than 2 MB');
    expect(post).not.toHaveBeenCalled();
  });
});
