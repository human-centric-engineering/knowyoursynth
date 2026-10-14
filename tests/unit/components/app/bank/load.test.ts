/**
 * What the databank pages read: the list rows and the names, from the bank and catalogue read layers.
 *
 * @see components/app/bank/load.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readBank, readBrowseLists, readNames } from '@/components/app/bank/load';
import { browseLists } from '@/components/app/bank/lists';
import { loadBank } from '@/lib/app/bank/read';
import { listSoundNames, listSynths } from '@/lib/app/catalogue/read';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';

vi.mock('@/lib/app/bank/read', () => ({ loadBank: vi.fn() }));
vi.mock('@/lib/app/catalogue/read', () => ({ listSynths: vi.fn(), listSoundNames: vi.fn() }));

const bank = loadBankData();
const SYNTHS = [{ id: 'model-d', maker: 'Behringer', name: 'Model D' }];

beforeEach(() => {
  vi.mocked(loadBank).mockResolvedValue(bank);
  vi.mocked(listSynths).mockResolvedValue(SYNTHS as never);
  vi.mocked(listSoundNames).mockResolvedValue({ 'model-d': { a: 'A sound' } });
});

describe('load', () => {
  it('reads the bank from the read layer', async () => {
    expect(await readBank()).toBe(bank);
  });

  it('works the list rows out with the listed synths as the ones "in this app"', async () => {
    expect(await readBrowseLists()).toEqual(browseLists(bank, new Set(['model-d'])));
  });

  it('names the listed synths and their sounds', async () => {
    const names = await readNames();
    expect(names.synths.get('model-d')).toEqual({ maker: 'Behringer', name: 'Model D' });
    expect(names.sounds).toEqual({ 'model-d': { a: 'A sound' } });
    expect(names.artists.get('kraftwerk')).toBe('Kraftwerk');
  });
});
