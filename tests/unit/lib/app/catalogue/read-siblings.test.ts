/**
 * The catalogue read layer's sibling sounds (`f-synth-families` t-322): a family member's detail serves its siblings'
 * library sounds, carried onto it through the family's map, each with the member it was made on.
 *
 * The database is mocked (B9), with the rows the seed would write for the TD-3 and the TB-303 (`synthRows()`), so the
 * translation is the real one over the real sounds. `translate` is the real function too, wrapped so one case can make
 * it return what the member would refuse.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSynthDetail } from '@/lib/app/catalogue/read';
import { logger } from '@/lib/logging';
import { getSynthDef } from '@/lib/app/synths/defs';
import { presetState } from '@/lib/app/synths/lib/patch';
import type { CablePair } from '@/lib/app/synths/contract';
import { translate } from '@/lib/app/synths/families/translate';
import { synthRows } from '@/tests/helpers/synth-detail';
import { bankDb } from '@/tests/helpers/bank-db';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    synth: { findFirst: vi.fn() },
    synthSound: { findMany: vi.fn() },
    synthNote: { findMany: vi.fn() },
    bankInstrument: { findMany: vi.fn() },
    bankSong: { findMany: vi.fn() },
    synthFamily: { findFirst: vi.fn() },
  },
}));
vi.mock('@/lib/app/links/read', () => ({
  summarisePublicLinks: vi.fn(async () => ({ count: 0, kinds: [] })),
  summariseSoundLinks: vi.fn(async () => ({})),
  summariseSongLinks: vi.fn(async () => new Map()),
}));
vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/app/synths/families/translate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/app/synths/families/translate')>();
  return { ...actual, translate: vi.fn(actual.translate) };
});

const { prisma } = await import('@/lib/db/client');
const realTranslate = (
  await vi.importActual<typeof import('@/lib/app/synths/families/translate')>(
    '@/lib/app/synths/families/translate'
  )
).translate;
const bank = bankDb();
const td3 = synthRows('td-3');
const tb303 = synthRows('tb-303');
const td3Def = getSynthDef('td-3');
const tb303Def = getSynthDef('tb-303');
if (!td3Def || !tb303Def) throw new Error('fixture: the registry has the TD-3 and the TB-303');

/** A stored sound as `synthSound.findMany` returns it, with its synth's id. */
const soundRowsOf = (rows: ReturnType<typeof synthRows>, synthId: string) =>
  rows.stored.sounds.map(({ patterns: _p, ...s }) => ({ ...s, synthId }));

const member = (slug: string, listed = true) => ({
  slug,
  label: slug.toUpperCase(),
  synthId: slug,
  differences: `What the ${slug} changed.`,
  instrument: { id: `i-${slug}`, name: slug, maker: 'Roland', year: '1981' },
  synth: { listed },
});
const family = (tbListed = true) => ({
  id: 'tb-303',
  name: 'TB-303',
  defaultMember: 'td-3',
  members: [member('td-3'), member('tb-303', tbListed)],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.bankInstrument.findMany).mockImplementation(
    bank.bankInstrument.findMany as never
  );
  vi.mocked(prisma.bankSong.findMany).mockImplementation(bank.bankSong.findMany as never);
  vi.mocked(prisma.synth.findFirst).mockImplementation((async (args: { where: { id: string } }) =>
    args.where.id === 'td-3'
      ? td3.stored
      : args.where.id === 'tb-303'
        ? tb303.stored
        : null) as never);
  vi.mocked(prisma.synthNote.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.synthFamily.findFirst).mockResolvedValue(family() as never);
  vi.mocked(prisma.synthSound.findMany).mockImplementation((async (args: {
    where: { synthId: { in: string[] } };
  }) => [
    ...(args.where.synthId.in.includes('td-3') ? soundRowsOf(td3, 'td-3') : []),
    ...(args.where.synthId.in.includes('tb-303') ? soundRowsOf(tb303, 'tb-303') : []),
  ]) as never);
});

describe('getSynthDetail: sibling sounds', () => {
  it("serves the TB-303's sounds on the TD-3, carried through the family's map, with the member they were made on", async () => {
    const detail = await getSynthDetail('td-3');

    expect(prisma.synthSound.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { synthId: { in: ['tb-303'] }, synth: { listed: true } } })
    );
    expect(detail?.sounds).toHaveLength(td3.stored.sounds.length);
    const siblings = detail?.siblingSounds ?? [];
    expect(siblings).toHaveLength(tb303.stored.sounds.length);
    expect(siblings.every((s) => s.from.synthId === 'tb-303' && s.from.name === 'TB-303')).toBe(
      true
    );

    // The first comes across as the map carries its whole panel: what its one step sets is the translation, over the
    // TD-3's Default patch, with the TD-3's default cables taken out for the carried ones.
    const first = siblings[0];
    const source = tb303.stored.sounds[0];
    const sourcePanel = presetState(tb303Def, {
      steps: source.steps as never,
      phrase: source.phrase as never,
    });
    const carry = realTranslate(
      sourcePanel.values,
      sourcePanel.cables.map((c): CablePair => [c.from, c.to]),
      tb303Def,
      td3Def
    );
    expect(first).toMatchObject({
      id: source.slug,
      name: source.name,
      ref: source.ref,
      phrase: source.phrase,
      version: td3Def.version,
      context: {},
      tweaks: [],
      dropped: carry.dropped,
      changed: carry.changed,
    });
    expect(first.steps).toHaveLength(1);
    const onTd3 = presetState(td3Def, first);
    expect(onTd3.values).toEqual({ ...presetState(td3Def).values, ...carry.values });
    const sorted = (cs: CablePair[]) => cs.map(([a, b]) => `${a}>${b}`).sort();
    expect(sorted(onTd3.cables.map((c): CablePair => [c.from, c.to]))).toEqual(
      sorted(carry.cables)
    );
    // The step names only what the sound changes from the Default patch, so showing it lights no more than that.
    // Its baseline is the Default patch with the riff's tempo, which TEMPO follows on the TD-3.
    const start = presetState(td3Def, { steps: [], phrase: first.phrase }).values;
    const set = first.steps[0].set ?? {};
    expect(Object.keys(set).length).toBeGreaterThan(0);
    expect(Object.entries(set).filter(([k, v]) => start[k] === v)).toEqual([]);
  });

  it('says what of a TD-3 sound does not come across to the TB-303', async () => {
    const detail = await getSynthDetail('tb-303');

    const siblings = detail?.siblingSounds ?? [];
    expect(siblings).toHaveLength(td3.stored.sounds.length);
    expect(siblings[0].from).toEqual({ synthId: 'td-3', name: 'TD-3' });
    // The TD-3 has a distortion the TB-303 lacks: it is named, not silently lost.
    expect(siblings[0].dropped.length).toBeGreaterThan(0);
    expect(siblings[0].dropped.every((d) => d.reason.length > 0)).toBe(true);
  });

  it('leaves out, and logs, a sibling sound that fails validation once carried', async () => {
    const control = td3Def.controls.find((c) => c.kind === 'cont' && !c.ui);
    if (!control) throw new Error('fixture: the TD-3 has a knob');
    const firstSlug = tb303.stored.sounds[0].slug;
    vi.mocked(translate).mockImplementationOnce((values, cables, from, to) => ({
      ...realTranslate(values, cables, from, to),
      values: { [control.id]: 'not a number' },
    }));

    const detail = await getSynthDetail('td-3');

    const siblings = detail?.siblingSounds ?? [];
    expect(siblings.map((s) => s.id)).not.toContain(firstSlug);
    expect(siblings).toHaveLength(tb303.stored.sounds.length - 1);
    expect(logger.error).toHaveBeenCalledWith(
      'catalogue: a sibling sound fails validation once carried, not served',
      expect.objectContaining({ synthId: 'td-3', from: 'tb-303', sound: firstSlug })
    );
  });

  it("leaves out a sibling's sound its own synth would not serve, without carrying it", async () => {
    const [bad, ...rest] = soundRowsOf(tb303, 'tb-303');
    vi.mocked(prisma.synthSound.findMany).mockResolvedValueOnce([
      { ...bad, definitionVersion: 99 },
      ...rest,
    ] as never);

    const detail = await getSynthDetail('td-3');

    expect(detail?.siblingSounds.map((s) => s.id)).not.toContain(bad.slug);
    expect(detail?.siblingSounds).toHaveLength(rest.length);
    // At debug level: the TB-303's own read reports it as an error, and each sibling's would report it again.
    expect(logger.debug).toHaveBeenCalledWith(
      'catalogue: sound made on a definition version the registry does not have',
      expect.objectContaining({ synthId: 'tb-303', sound: bad.slug })
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('serves none, and reads none, when the family has no other served member', async () => {
    vi.mocked(prisma.synthFamily.findFirst).mockResolvedValue({
      ...family(false),
      // with the TB-303 hidden, an unmodelled member keeps the family served
      members: [...family(false).members, { ...member('rebirth'), synthId: null, synth: null }],
    } as never);

    const detail = await getSynthDetail('td-3');

    expect(detail?.family?.members.map((m) => m.slug)).toEqual(['td-3', 'rebirth']);
    expect(detail?.siblingSounds).toEqual([]);
    expect(prisma.synthSound.findMany).not.toHaveBeenCalled();
  });

  it('serves the synth with its own sounds alone when the sibling sounds cannot be read', async () => {
    vi.mocked(prisma.synthSound.findMany).mockRejectedValueOnce(new Error('connection lost'));

    const detail = await getSynthDetail('td-3');

    expect(detail?.sounds).toHaveLength(td3.stored.sounds.length);
    expect(detail?.siblingSounds).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      'catalogue: could not read the sibling sounds, served without them',
      { synthId: 'td-3', err: 'Error: connection lost' }
    );
  });
});
