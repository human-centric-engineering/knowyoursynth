/**
 * The brand a maker is grouped under in the synth picker, and a databank name without its maker
 * (`f-synth-picker` t-328).
 *
 * @see lib/app/catalogue/makers.ts
 */
import { describe, it, expect } from 'vitest';
import { makerGroup, nameWithoutMaker } from '@/lib/app/catalogue/makers';

describe('makerGroup', () => {
  it("joins the catalogue's and the databank's spellings of one brand", () => {
    expect(['Moog', 'Moog Music', 'R. A. Moog Co.'].map(makerGroup)).toEqual([
      'Moog',
      'Moog',
      'Moog',
    ]);
    expect(['Oberheim', 'Oberheim Electronics'].map(makerGroup)).toEqual(['Oberheim', 'Oberheim']);
    expect(['Sequential', 'Sequential Circuits'].map(makerGroup)).toEqual([
      'Sequential',
      'Sequential',
    ]);
    expect(
      ['Buchla', 'Buchla & Associates', 'Buchla Electronic Musical Instruments'].map(makerGroup)
    ).toEqual(['Buchla', 'Buchla', 'Buchla']);
    expect(['EMS', 'Electronic Music Studios'].map(makerGroup)).toEqual(['EMS', 'EMS']);
  });

  it('ignores case and surrounding space', () => {
    expect(makerGroup('  moog MUSIC ')).toBe('Moog');
  });

  it('leaves any other maker as written', () => {
    expect(makerGroup('Behringer')).toBe('Behringer');
    expect(makerGroup('Elta Music')).toBe('Elta Music');
    expect(makerGroup(' Dreadbox ')).toBe('Dreadbox');
  });
});

describe('nameWithoutMaker', () => {
  it('drops the whole maker, or its first word, from the front of the name', () => {
    expect(nameWithoutMaker('Sequential Circuits Pro-One', 'Sequential Circuits')).toBe('Pro-One');
    expect(nameWithoutMaker('ARP Odyssey Mk II', 'ARP Instruments')).toBe('Odyssey Mk II');
    expect(nameWithoutMaker('Korg ARP 2600 FS', 'Korg')).toBe('ARP 2600 FS');
  });

  it('leaves a name that does not start with its maker', () => {
    expect(nameWithoutMaker('Minimoog Model D', 'Moog Music')).toBe('Minimoog Model D');
  });

  it('leaves a name that is only its maker, and matches whole words only', () => {
    expect(nameWithoutMaker('Moog', 'Moog Music')).toBe('Moog');
    expect(nameWithoutMaker('Moogerfooger', 'Moog Music')).toBe('Moogerfooger');
  });
});
