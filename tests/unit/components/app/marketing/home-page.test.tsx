// @vitest-environment happy-dom

/**
 * `/`: the home page (`f-front-door` t-63). The catalogue read is a fake, and so is the panel drawing: what the page
 * makes of them (the first synth's play link and panel, the synth list, the fallbacks) is the subject. The route file
 * is a shim, so it is imported here to prove it serves this module.
 *
 * @see components/app/marketing/home-page.tsx · components/app/marketing/hero-panel.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/lib/app/catalogue/read', () => ({ listSynths: vi.fn() }));
vi.mock('@/components/app/sharing/panel-image', () => ({ panelSvg: vi.fn() }));

import HomeRoute, { metadata as routeMetadata } from '@/app/(public)/page';
import HomePage, { metadata } from '@/components/app/marketing/home-page';
import { panelSvg } from '@/components/app/sharing/panel-image';
import { listSynths, type CatalogueSynth } from '@/lib/app/catalogue/read';

const synth = (over: Partial<CatalogueSynth>): CatalogueSynth => ({
  id: 'model-d',
  name: 'Model D',
  maker: 'Behringer',
  year: 2018,
  heritage: 'Modelled on the 1970 Minimoog Model D',
  summary: '',
  design: 'neutral',
  definitionVersion: 1,
  soundCount: 3,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listSynths).mockResolvedValue([
    synth({}),
    synth({
      id: 'jupiter-4',
      name: 'Jupiter-4',
      maker: 'Roland',
      year: 1978,
      heritage: 'Roland, 1978',
    }),
  ]);
  vi.mocked(panelSvg).mockReturnValue({
    svg: '<svg data-testid="panel-svg"></svg>',
    width: 1200,
    height: 400,
  });
});

async function renderPage() {
  return render(await HomePage());
}

describe('home page', () => {
  it('is what the route file serves, metadata and all', () => {
    expect(HomeRoute).toBe(HomePage);
    expect(routeMetadata).toBe(metadata);
  });

  it('names the app in an absolute title, so the layout does not append the brand twice', () => {
    expect(metadata.title).toEqual({ absolute: 'Sunrise — learn the synths you own' });
    expect(metadata.description).toMatch(/^Play a synth's panel in your browser/);
    expect(metadata.openGraph?.description).toBe(metadata.description);
  });

  it('leads with the heading and a play link to the first listed synth', async () => {
    await renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Get to know your synth.' })
    ).toBeInTheDocument();
    const play = screen.getAllByRole('link', { name: 'Play the Model D' });
    // the hero's and the closing section's
    expect(play).toHaveLength(2);
    for (const link of play) expect(link).toHaveAttribute('href', '/synths/model-d');
    expect(screen.getByRole('link', { name: 'See all the synths' })).toHaveAttribute(
      'href',
      '#synths'
    );
  });

  it("draws the first synth's panel in its catalogue design", async () => {
    vi.mocked(listSynths).mockResolvedValue([synth({ design: 'faithful' })]);
    await renderPage();
    expect(panelSvg).toHaveBeenCalledWith(
      expect.objectContaining({
        def: expect.objectContaining({ id: 'model-d' }),
        design: 'faithful',
      })
    );
    expect(screen.getByRole('img', { name: 'The Model D panel' })).toBeInTheDocument();
    expect(screen.getByTestId('panel-svg')).toBeInTheDocument();
  });

  it('lists every synth from the catalogue with its maker, year and heritage, each linking to its page', async () => {
    await renderPage();
    const list = within(
      screen.getByRole('heading', { name: 'The synths, panel by panel' }).parentElement!
    );
    const rows = list.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('link')).toHaveAttribute('href', '/synths/jupiter-4');
    expect(rows[1]).toHaveTextContent('Jupiter-4');
    expect(rows[1]).toHaveTextContent('Roland');
    expect(rows[1]).toHaveTextContent('1978');
    expect(rows[0]).toHaveTextContent('Modelled on the 1970 Minimoog Model D');
  });

  it('falls back to opening the synths, with no panel, when nothing is listed', async () => {
    vi.mocked(listSynths).mockResolvedValue([]);
    await renderPage();
    for (const link of screen.getAllByRole('link', { name: 'Open a synth' })) {
      expect(link).toHaveAttribute('href', '/synths');
    }
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Play the/ })).not.toBeInTheDocument();
  });

  it('shows the page without the picture when the panel cannot be drawn', async () => {
    vi.mocked(listSynths).mockResolvedValue([synth({ id: 'jupiter-4', name: 'Jupiter-4' })]);
    vi.mocked(panelSvg).mockImplementation(() => {
      throw new Error('renderer missing');
    });
    await renderPage();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Play the Jupiter-4' })[0]).toBeInTheDocument();
  });

  it('quotes no counts', async () => {
    const { container } = await renderPage();
    // Outside the catalogue's own rows (names such as Jupiter-4, and years), the page has no figures at all.
    container.querySelectorAll('li').forEach((row) => row.remove());
    expect(container.textContent).not.toMatch(/\d/);
  });

  it('tries the drawing again on the next visit after one fails', async () => {
    vi.mocked(listSynths).mockResolvedValue([
      synth({ id: 'jupiter-4', name: 'Jupiter-4', design: 'faithful' }),
    ]);
    vi.mocked(panelSvg).mockImplementationOnce(() => {
      throw new Error('renderer missing');
    });
    await renderPage();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await renderPage();
    expect(screen.getByRole('img', { name: 'The Jupiter-4 panel' })).toBeInTheDocument();
  });
});
