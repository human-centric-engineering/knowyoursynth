// @vitest-environment happy-dom

/**
 * The placeholder synth page, `/synths/[id]`.
 *
 * It holds the route until the real synth page lands. It must say what it is,
 * and must 404 an id that cannot be a synth id rather than echo arbitrary text
 * into a heading and a title.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { notFound } from 'next/navigation';

import SynthPage, { generateMetadata } from '@/app/(panel)/synths/[id]/page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('/synths/[id] placeholder', () => {
  it('names the synth and says its panel is not here yet', async () => {
    render(await SynthPage(params('model-d')));

    expect(screen.getByRole('heading', { level: 1, name: 'model-d' })).toBeInTheDocument();
    expect(screen.getByText(/panel isn.t in the app yet/)).toBeInTheDocument();
  });

  it.each(['Model-D', 'model_d', '-model', 'model--d', '<script>'])(
    '404s an id that is not a synth id: %s',
    async (id) => {
      await expect(SynthPage(params(id))).rejects.toThrow('NEXT_NOT_FOUND');
      expect(notFound).toHaveBeenCalled();
    }
  );

  it('titles the page with the id, and not with an invalid one', async () => {
    await expect(generateMetadata(params('jupiter-8'))).resolves.toEqual({ title: 'jupiter-8' });
    await expect(generateMetadata(params('<b>'))).resolves.toEqual({ title: 'Synth' });
  });
});
