/**
 * The reference list (`data/bank/reference.json`, `f-databank` t-38): every hardware synth, compiled with a source for
 * each, loaded beside the 86 instruments named on records. Its shape (a source on every entry, no app synths) is the
 * loader's check (`seed-data.test.ts`); that the whole databank passes `checkBank` is `seed.test.ts`'s; that "Heard on"
 * is unchanged is `joins.test.ts`'s. This holds the list to what it is for.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BankInstrumentsFileSchema, BankReferenceFileSchema } from '@/lib/app/bank/data';
import { BANK_DATA_DIR, loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';

const read = (file: string): unknown => JSON.parse(readFileSync(join(BANK_DATA_DIR, file), 'utf8'));
const named = BankInstrumentsFileSchema.parse(read('instruments.json')).instruments;
const reference = BankReferenceFileSchema.parse(read('reference.json')).instruments;
const bank = loadBankData();
const byId = new Map(bank.instruments.map((i) => [i.id, i]));

/**
 * Companies named on the 86 whose whole commercial range of synths is already there, so the list adds nothing for
 * them. Each is a one-off: an inventor's own instrument, or a maker that sold no other synth.
 */
const NOTHING_MORE: Record<string, string> = {
  RCA: 'The theremin is listed; the Mark II was built for Columbia–Princeton and never sold.',
  'Leon Theremin': 'His instruments for sale were RCA’s theremin; the Rhythmicon is listed.',
  'Maurice Martenot': 'The ondes Martenot, listed, was his one instrument.',
  'Rundfunkversuchsstelle, Berlin':
    'A research studio; the commercial Trautonium was Telefunken’s, which the list has.',
  'Oskar Sala': 'The Mixtur-Trautonium, listed, was his own and never sold.',
  'Hugh Le Caine': 'No maker took up his instruments for sale.',
  'Yevgeny Murzin': 'One ANS synthesizer was built.',
  'Oramics Studios': 'The Oramics machine, listed, was never sold.',
  'Serge Modular Music Systems':
    'Its one line, the modular, is listed; later production is Sound Transform Systems’.',
  Lowrey: 'It sold no synth apart from the String Symphonizer, listed; the rest are organs.',
};

/** The Behringer recreations behind the app's panels, and the original each copies. */
const PANEL_RECREATIONS: Record<string, { original: string; panel: string }> = {
  'behringer-model-d': { original: 'moog-minimoog', panel: 'model-d' },
  'behringer-pro-1': { original: 'sequential-pro-one', panel: 'pro-1' },
  'behringer-k-2': { original: 'korg-ms-20', panel: 'k2' },
  'behringer-2600': { original: 'arp-2600', panel: 'b2600' },
  'behringer-ub-xa-d': { original: 'oberheim-ob-xa', panel: 'ub-xa-d' },
  'behringer-2-xm': { original: 'oberheim-two-voice', panel: '2-xm' },
  'behringer-kobol-expander': { original: 'rsf-kobol-expander', panel: 'kobol' },
  'behringer-cat': { original: 'octave-cat', panel: 'cat' },
  'behringer-wasp-deluxe': { original: 'edp-wasp', panel: 'wasp-deluxe' },
  'behringer-pro-800': { original: 'sequential-prophet-600', panel: 'pro-800' },
  'behringer-td-3': { original: 'roland-tb-303', panel: 'td-3' },
  'behringer-model-15': { original: 'moog-grandmother', panel: 'model-15' },
  'behringer-system-15': { original: 'moog-modular', panel: 'system-15' },
  'behringer-system-35': { original: 'moog-modular', panel: 'system-35' },
  'behringer-system-55': { original: 'moog-modular', panel: 'system-55' },
};

describe('the reference list', () => {
  it('is loaded after the 86, with their ids unchanged', () => {
    expect(bank.instruments.map((i) => i.id)).toEqual([
      ...named.map((i) => i.id),
      ...reference.map((i) => i.id),
    ]);
    expect(reference.length).toBeGreaterThan(0);
  });

  it('covers every company named on the 86', () => {
    const companies = [...new Set(named.map((i) => i.maker))];
    const listed = new Set(reference.map((i) => i.maker));
    expect(companies.length).toBeGreaterThan(30);
    expect(companies.filter((c) => !listed.has(c) && !(c in NOTHING_MORE))).toEqual([]);
    // An exemption for a company the list does cover is stale.
    expect(Object.keys(NOTHING_MORE).filter((c) => listed.has(c))).toEqual([]);
  });

  it.each(Object.entries(PANEL_RECREATIONS))(
    'lists %s, linked to the original its panel is filed under',
    (id, { original, panel }) => {
      const entry = reference.find((i) => i.id === id);
      expect(entry?.maker).toBe('Behringer');
      expect(entry?.recreationOf).toBe(original);
      // "Heard on" stays on the original: the panel's synth is still listed there.
      expect(byId.get(original)?.app).toContain(panel);
    }
  );

  it('repeats none of the instruments, by name or id', () => {
    const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const names = bank.instruments.map((i) => key(i.name));
    expect(names.filter((n, k) => names.indexOf(n) !== k)).toEqual([]);
    expect(new Set(byId.keys()).size).toBe(bank.instruments.length);
  });

  it('links a recreation only to an original, never to another recreation', () => {
    const chained = reference.filter(
      (i) => i.recreationOf && byId.get(i.recreationOf)?.recreationOf !== undefined
    );
    expect(chained.map((i) => i.id)).toEqual([]);
  });
});
