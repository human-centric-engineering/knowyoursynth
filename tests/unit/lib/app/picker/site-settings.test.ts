/**
 * The site's synth picker settings (`f-synth-picker` t-329): the one row, the defaults without it, a bad row read as
 * the defaults, and a page that renders with the defaults when the read fails.
 *
 * @see lib/app/picker/site-settings.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findUnique, upsert, logger } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/db/client', () => {
  const synthPickerSettings = { findUnique, upsert };
  return {
    prisma: {
      synthPickerSettings,
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ synthPickerSettings })),
    },
  };
});
vi.mock('@/lib/logging', () => ({ logger }));

import {
  getSitePickerSettings,
  setSitePickerSettings,
  sitePickerForPage,
} from '@/lib/app/picker/site-settings';
import { FACTORY_PICKER, type SitePickerSettings } from '@/lib/app/picker/settings';

const SAVED: SitePickerSettings = {
  scope: 'all',
  group: 'lineage',
  order: 'old',
  kinds: ['modular'],
  thumbs: false,
  visitorsMayChange: false,
  offerAll: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue(null);
  upsert.mockResolvedValue(undefined);
});

describe('getSitePickerSettings', () => {
  it('is the defaults until an admin saves any', async () => {
    expect(await getSitePickerSettings()).toEqual(FACTORY_PICKER);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'site' } }));
  });

  it('is the saved row', async () => {
    findUnique.mockResolvedValue(SAVED);
    expect(await getSitePickerSettings()).toEqual(SAVED);
  });

  it('reads a row edited into a shape the schema refuses as the defaults, and says so', async () => {
    findUnique.mockResolvedValue({ ...SAVED, group: 'by colour' });
    expect(await getSitePickerSettings()).toEqual(FACTORY_PICKER);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe('setSitePickerSettings', () => {
  it('keeps the kinds in the databank’s order, so a reorder is never a change', async () => {
    findUnique.mockResolvedValue({ ...SAVED, kinds: ['poly', 'mono'] });
    const { before, after } = await setSitePickerSettings({ ...SAVED, kinds: ['poly', 'mono'] });
    expect(after.kinds).toEqual(['mono', 'poly']);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ kinds: ['mono', 'poly'] }) })
    );
    expect(before.kinds).toEqual(['poly', 'mono']);
  });

  it('writes the one row, and returns the settings before and after', async () => {
    const result = await setSitePickerSettings(SAVED);
    expect(upsert).toHaveBeenCalledWith({
      where: { id: 'site' },
      create: { id: 'site', ...SAVED },
      update: SAVED,
    });
    expect(result).toEqual({ before: FACTORY_PICKER, after: SAVED });
  });
});

describe('sitePickerForPage', () => {
  it('is the site’s settings', async () => {
    findUnique.mockResolvedValue(SAVED);
    expect(await sitePickerForPage()).toEqual(SAVED);
  });

  it('is the defaults, and says why, when the read fails', async () => {
    findUnique.mockRejectedValue(new Error('database down'));
    expect(await sitePickerForPage()).toEqual(FACTORY_PICKER);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
