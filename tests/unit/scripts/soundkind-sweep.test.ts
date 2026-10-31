/**
 * The library sweep refuses seed data it cannot read honestly: a sound for a synth with no definition, and a sound
 * that is not valid (which includes one whose first tag is not a category). The whole-library run is `soundkind-library.test.ts`.
 *
 * @see scripts/soundkind-sweep.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const load = vi.hoisted(() => vi.fn());
vi.mock('@/prisma/seeds/app-knowyoursynth/catalogue-data', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('@/prisma/seeds/app-knowyoursynth/catalogue-data')>();
  return { ...real, loadCatalogueData: load };
});

import { PATTERN_ROLES } from '@/lib/app/patterns/library-facts';
import { PRESET_CATEGORIES } from '@/lib/app/synths/contract';
import { sweepShard } from '@/scripts/soundkind-sweep';

/** A real Model D sound from the seed data, with its id and anything else given replaced. */
let modelD: Record<string, unknown> = {};
const sound = (over: Record<string, unknown> = {}) => ({ ...modelD, id: 'plain', ...over });

const withSounds = (synth: string, sounds: unknown[]) =>
  load.mockReturnValue({ sounds: [{ synth, sounds }] });

describe('sweepShard', () => {
  beforeEach(async () => {
    load.mockReset();
    const actual = await vi.importActual<
      typeof import('@/prisma/seeds/app-knowyoursynth/catalogue-data')
    >('@/prisma/seeds/app-knowyoursynth/catalogue-data');
    const first = actual.loadCatalogueData().sounds.find((f) => f.synth === 'model-d')?.sounds[0];
    if (!first) throw new Error('the seed data has a Model D sound');
    modelD = first;
  });

  it('reads a valid sound into a row with its category and its riff’s role', () => {
    withSounds('model-d', [sound()]);
    const [row] = sweepShard(0, 1);
    expect(row).toMatchObject({ synth: 'model-d', id: 'plain' });
    expect(PRESET_CATEGORIES).toContain(row.category);
    expect(PATTERN_ROLES).toContain(row.role);
    expect(row.features.silent).toBe(false);
  });

  it('takes only its own shard', () => {
    withSounds('model-d', [sound({ id: 'a' }), sound({ id: 'b' }), sound({ id: 'c' })]);
    expect(sweepShard(1, 2).map((r) => r.id)).toEqual(['b']);
  });

  it('refuses a synth with no definition', () => {
    withSounds('no-such-synth', [sound()]);
    expect(() => sweepShard(0, 1)).toThrow(/no definition for no-such-synth/);
  });

  it('refuses a sound that is not valid', () => {
    withSounds('model-d', [sound({ steps: 'not steps' })]);
    expect(() => sweepShard(0, 1)).toThrow(/model-d\/plain is not a valid sound/);
  });
});
