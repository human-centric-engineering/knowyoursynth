/**
 * The social card's fonts (t-50): `@fontsource` WOFFs unpacked to TrueType for the rasteriser, each renamed to its
 * family so the panel's `font-family` finds it. Pins:
 *
 * - a WOFF unpacks to an sfnt with the same tables, uncompressed, at 4-byte boundaries;
 * - its name table says the family alone (not "… Medium"), which is what makes the panel's lettering match;
 * - every file the card needs is written whole, left alone once it is there, and written again if it is removed.
 *
 * @see components/app/sharing/card-fonts.ts
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cardFontFiles, woffToSfnt } from '@/components/app/sharing/card-fonts';

const WOFF = readFileSync(
  'node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-500-normal.woff'
);

/** The sfnt's tables: tag → [offset, length]. */
function tables(sfnt: Buffer): Map<string, [number, number]> {
  const count = sfnt.readUInt16BE(4);
  return new Map(
    Array.from({ length: count }, (_, i) => {
      const at = 12 + i * 16;
      return [
        sfnt.toString('ascii', at, at + 4),
        [sfnt.readUInt32BE(at + 8), sfnt.readUInt32BE(at + 12)],
      ];
    })
  );
}

/** Every Windows-platform name record's text, by name id. */
function names(sfnt: Buffer): Map<number, string> {
  const [at] = tables(sfnt).get('name')!;
  const count = sfnt.readUInt16BE(at + 2);
  const strings = at + sfnt.readUInt16BE(at + 4);
  const out = new Map<number, string>();
  for (let i = 0; i < count; i++) {
    const r = at + 6 + i * 12;
    if (sfnt.readUInt16BE(r) !== 3) continue;
    const len = sfnt.readUInt16BE(r + 8);
    const off = strings + sfnt.readUInt16BE(r + 10);
    out.set(
      sfnt.readUInt16BE(r + 6),
      Buffer.from(sfnt.subarray(off, off + len))
        .swap16()
        .toString('utf16le')
    );
  }
  return out;
}

describe('woffToSfnt', () => {
  it('unpacks every table, uncompressed and aligned, under the WOFF header’s flavour', () => {
    const sfnt = woffToSfnt(WOFF, 'Barlow Semi Condensed');
    expect(sfnt.readUInt32BE(0)).toBe(WOFF.readUInt32BE(4));
    const count = WOFF.readUInt16BE(12);
    const t = tables(sfnt);
    expect(t.size).toBe(count);
    for (let i = 0; i < count; i++) {
      const e = 44 + i * 20;
      const tag = WOFF.toString('ascii', e, e + 4);
      const [offset, length] = t.get(tag)!;
      expect(offset % 4).toBe(0);
      expect(offset + length).toBeLessThanOrEqual(sfnt.length);
      // every table but the rewritten name table is its original length
      if (tag !== 'name') expect(length).toBe(WOFF.readUInt32BE(e + 12));
    }
  });

  it('names the font for its family alone, where the WOFF names the weight too', () => {
    const before = names(woffToSfnt(WOFF, 'placeholder'));
    expect(before.get(1)).toBe('placeholder');
    const after = names(woffToSfnt(WOFF, 'Barlow Semi Condensed'));
    expect(after.get(1)).toBe('Barlow Semi Condensed');
    expect(after.get(2)).toBe('Regular');
  });

  it('refuses a file that is not a WOFF', () => {
    expect(() =>
      woffToSfnt(Buffer.from('not a font at all, nowhere near 44 bytes long..'), 'X')
    ).toThrow(/Not a WOFF/);
  });
});

describe('cardFontFiles', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kys-card-fonts-test-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes each face the panel uses, whole, and leaves it be once it is there', () => {
    const files = cardFontFiles(dir);
    expect(files.length).toBe(12);
    for (const f of files) expect(existsSync(f)).toBe(true);
    expect(files.some((f) => f.endsWith('michroma-latin-400-normal.ttf'))).toBe(true);
    expect(readdirSync(dir).filter((f) => !f.endsWith('.ttf'))).toEqual([]);
    const written = files.map((f) => statSync(f).mtimeMs);
    expect(cardFontFiles(dir)).toEqual(files);
    expect(files.map((f) => statSync(f).mtimeMs)).toEqual(written);
  });

  it('unpacks again what a temp-directory cleaner has removed', () => {
    const files = cardFontFiles(dir);
    const kept = readFileSync(files[0]);
    rmSync(dir, { recursive: true });
    expect(cardFontFiles(dir)).toEqual(files);
    for (const f of files) expect(existsSync(f)).toBe(true);
    expect(readFileSync(files[0]).equals(kept)).toBe(true);
  });
});
