/**
 * `/synths/about/[instrument]` (`f-synth-picker` t-330): a databank instrument nobody has modelled, in the synth's
 * place. Pins:
 *
 * - an id no instrument could have, or one the databank does not have, is a 404;
 * - an instrument a listed synth models is that synth: its address redirects to the synth's page;
 * - otherwise the page gets the instrument's detail, the catalogue, the families, the site's picker settings and which
 *   databank instruments play as which listed synth, read from one load of the databank;
 * - a failed families read lists the synths alone rather than failing the page;
 * - its title names the instrument.
 *
 * @see app/(panel)/synths/about/[instrument]/page.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';

vi.mock('@/components/app/synth/synth.css', () => ({}));
vi.mock('@/components/app/synth/instrument-about', () => ({ InstrumentAbout: () => null }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
const read = vi.hoisted(() => ({
  loadBank: vi.fn(),
  detailFrom: vi.fn(),
  listFrom: vi.fn(),
}));
vi.mock('@/lib/app/bank/read', () => read);
vi.mock('@/lib/app/catalogue/read', () => ({ listSynths: vi.fn() }));
vi.mock('@/lib/app/families/read', () => ({ listFamilies: vi.fn() }));
vi.mock('@/lib/app/picker/site-settings', () => ({ sitePickerForPage: vi.fn() }));
vi.mock('@/lib/logging', () => ({ logger: { warn: vi.fn() } }));

import InstrumentAboutRoute, {
  generateMetadata,
} from '@/app/(panel)/synths/about/[instrument]/page';
import { listSynths } from '@/lib/app/catalogue/read';
import { listFamilies } from '@/lib/app/families/read';
import { sitePickerForPage } from '@/lib/app/picker/site-settings';
import { FACTORY_PICKER } from '@/lib/app/picker/settings';

const BANK = { instruments: [] };
const DETAIL = {
  instrument: { id: 'moog-minimoog', name: 'Minimoog Model D', maker: 'Moog Music', year: '1970' },
  synths: [] as string[],
};
const INSTRUMENTS = [
  { id: 'moog-minimoog', synths: [] },
  { id: 'behringer-model-d', synths: ['model-d'] },
  { id: 'moog-model-d-2016', synths: ['unlisted-synth'] },
];
const SYNTHS = [{ id: 'model-d' }, { id: 'td-3' }];
const FAMILIES = [{ id: 'minimoog' }];

const props = (instrument: string) => ({ params: Promise.resolve({ instrument }) });

beforeEach(() => {
  vi.clearAllMocks();
  read.loadBank.mockResolvedValue(BANK);
  read.detailFrom.mockReturnValue(DETAIL);
  read.listFrom.mockReturnValue(INSTRUMENTS);
  vi.mocked(listSynths).mockResolvedValue(SYNTHS as never);
  vi.mocked(listFamilies).mockResolvedValue(FAMILIES as never);
  vi.mocked(sitePickerForPage).mockResolvedValue(FACTORY_PICKER);
});

describe('/synths/about/[instrument]', () => {
  it('passes the detail, the catalogue, the families, the picker settings and what plays, from one databank load', async () => {
    const el = (await InstrumentAboutRoute(props('moog-minimoog'))) as ReactElement<
      Record<string, unknown>
    >;
    expect(el.props).toEqual({
      detail: DETAIL,
      synths: SYNTHS,
      families: FAMILIES,
      pickerSite: FACTORY_PICKER,
      // Only listed synths play: the 2016 reissue's synth is not listed.
      playsAs: { 'behringer-model-d': 'model-d' },
    });
    expect(read.loadBank).toHaveBeenCalledOnce();
    expect(read.detailFrom).toHaveBeenCalledWith(BANK, 'instruments', 'moog-minimoog');
  });

  it('lists the synths alone when the families cannot be read', async () => {
    vi.mocked(listFamilies).mockRejectedValue(new Error('no such table'));
    const el = (await InstrumentAboutRoute(props('moog-minimoog'))) as ReactElement<
      Record<string, unknown>
    >;
    expect(el.props.families).toEqual([]);
  });

  it('is a 404 for an instrument the databank does not have, or an id none could have', async () => {
    read.detailFrom.mockReturnValue(null);
    await expect(InstrumentAboutRoute(props('no-such-synth'))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(InstrumentAboutRoute(props('Not An Id'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('sends an instrument a listed synth models to that synth’s page', async () => {
    read.detailFrom.mockReturnValue({ ...DETAIL, synths: ['unlisted-synth', 'model-d'] });
    await expect(InstrumentAboutRoute(props('behringer-model-d'))).rejects.toThrow(
      'NEXT_REDIRECT /synths/model-d'
    );
  });

  it('is titled by the instrument, and plainly when there is none', async () => {
    expect(await generateMetadata(props('moog-minimoog'))).toMatchObject({
      title: 'Minimoog Model D',
      description: expect.stringContaining('Moog Music'),
    });
    read.detailFrom.mockReturnValue(null);
    expect(await generateMetadata(props('gone'))).toEqual({ title: 'Synth' });
  });
});
