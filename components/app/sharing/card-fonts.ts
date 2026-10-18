import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

/**
 * The panel's lettering, as font files the card's rasteriser can load (t-50).
 *
 * The panel names its faces in CSS (`fontFor` in `components/app/panel/parts.tsx`), and the browser gets them from
 * `@fontsource`. The rasteriser (`@resvg/resvg-js`) has no browser: it reads only TrueType files from disk, and its
 * native build takes no font bytes in memory. So each `@fontsource` WOFF the panel uses is unpacked to TrueType into
 * a temporary directory, whenever it is not already there, and its paths are handed over.
 *
 * Each weight ships as its own family ("Barlow Semi Condensed Medium"), which the panel's `font-family` would never
 * match, so its name table is rewritten to the family alone; the weight still comes from the font's `OS/2` table.
 * Without this, every label falls back to whatever the server has, which on a container is nothing.
 */

/** The faces and weights the panels use, as rendering all of them reports (Georgia, on one faithful logo, is not). */
const FACES: { family: string; files: URL[] }[] = [
  {
    family: 'Barlow Semi Condensed',
    files: [
      new URL(
        '../../../node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-300-normal.woff',
        import.meta.url
      ),
      new URL(
        '../../../node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-500-normal.woff',
        import.meta.url
      ),
      new URL(
        '../../../node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-600-normal.woff',
        import.meta.url
      ),
      new URL(
        '../../../node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-700-normal.woff',
        import.meta.url
      ),
      new URL(
        '../../../node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-800-normal.woff',
        import.meta.url
      ),
    ],
  },
  {
    family: 'Archivo Narrow',
    files: [
      new URL(
        '../../../node_modules/@fontsource/archivo-narrow/files/archivo-narrow-latin-500-normal.woff',
        import.meta.url
      ),
      new URL(
        '../../../node_modules/@fontsource/archivo-narrow/files/archivo-narrow-latin-600-normal.woff',
        import.meta.url
      ),
      new URL(
        '../../../node_modules/@fontsource/archivo-narrow/files/archivo-narrow-latin-700-normal.woff',
        import.meta.url
      ),
    ],
  },
  {
    family: 'Instrument Sans',
    files: [
      new URL(
        '../../../node_modules/@fontsource/instrument-sans/files/instrument-sans-latin-500-normal.woff',
        import.meta.url
      ),
    ],
  },
  {
    family: 'JetBrains Mono',
    files: [
      new URL(
        '../../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff',
        import.meta.url
      ),
      new URL(
        '../../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff',
        import.meta.url
      ),
    ],
  },
  {
    family: 'Michroma',
    files: [
      new URL(
        '../../../node_modules/@fontsource/michroma/files/michroma-latin-400-normal.woff',
        import.meta.url
      ),
    ],
  },
];

/** The family every face falls back to. */
export const CARD_DEFAULT_FAMILY = 'Barlow Semi Condensed';

/** A `name` table naming the font `family`, in the Windows Unicode records font matchers read. */
function nameTable(family: string): Buffer {
  const utf16be = (text: string) => Buffer.from(text, 'utf16le').swap16();
  const records: [number, Buffer][] = [
    [1, utf16be(family)],
    [2, utf16be('Regular')],
    [4, utf16be(family)],
    [6, utf16be(family.replace(/\s+/g, ''))],
  ];
  const head = Buffer.alloc(6 + 12 * records.length);
  head.writeUInt16BE(0, 0);
  head.writeUInt16BE(records.length, 2);
  head.writeUInt16BE(head.length, 4);
  let offset = 0;
  records.forEach(([id, text], i) => {
    const at = 6 + i * 12;
    head.writeUInt16BE(3, at); // Windows
    head.writeUInt16BE(1, at + 2); // Unicode BMP
    head.writeUInt16BE(0x409, at + 4); // en-US
    head.writeUInt16BE(id, at + 6);
    head.writeUInt16BE(text.length, at + 8);
    head.writeUInt16BE(offset, at + 10);
    offset += text.length;
  });
  return Buffer.concat([head, ...records.map(([, text]) => text)]);
}

/**
 * A WOFF (1.0) font as the TrueType/OpenType file it wraps, its name table replaced to say `family`. WOFF is the
 * file's tables, each zlib-compressed where that made it smaller, behind a 44-byte header and a 20-byte entry per
 * table; the sfnt is the same tables, uncompressed and 4-byte aligned, behind a 12-byte header and 16-byte entries.
 */
export function woffToSfnt(woff: Buffer, family: string): Buffer {
  if (woff.toString('ascii', 0, 4) !== 'wOFF') throw new Error('Not a WOFF font');
  const flavor = woff.readUInt32BE(4);
  const count = woff.readUInt16BE(12);
  const tables = Array.from({ length: count }, (_, i) => {
    const at = 44 + i * 20;
    const tag = woff.toString('ascii', at, at + 4);
    const offset = woff.readUInt32BE(at + 4);
    const compressed = woff.readUInt32BE(at + 8);
    const length = woff.readUInt32BE(at + 12);
    const raw = woff.subarray(offset, offset + compressed);
    const data =
      tag === 'name'
        ? nameTable(family)
        : compressed < length
          ? inflateSync(raw)
          : Buffer.from(raw);
    return { tag, checksum: woff.readUInt32BE(at + 16), data };
  });

  let log2 = 0;
  while (1 << (log2 + 1) <= count) log2++;
  const head = Buffer.alloc(12 + 16 * count);
  head.writeUInt32BE(flavor, 0);
  head.writeUInt16BE(count, 4);
  head.writeUInt16BE((1 << log2) * 16, 6); // searchRange
  head.writeUInt16BE(log2, 8); // entrySelector
  head.writeUInt16BE(count * 16 - (1 << log2) * 16, 10); // rangeShift
  const parts: Buffer[] = [head];
  let offset = head.length;
  tables.forEach((t, i) => {
    const at = 12 + i * 16;
    head.write(t.tag, at, 'ascii');
    head.writeUInt32BE(t.checksum, at + 4);
    head.writeUInt32BE(offset, at + 8);
    head.writeUInt32BE(t.data.length, at + 12);
    const pad = (4 - (t.data.length % 4)) % 4;
    parts.push(t.data, Buffer.alloc(pad));
    offset += t.data.length + pad;
  });
  return Buffer.concat(parts);
}

/** Each face's WOFF and the family it is renamed to. */
const SOURCES = FACES.flatMap(({ family, files }) =>
  files.map((src) => ({ family, path: fileURLToPath(src) }))
);

/** This process's font directory, once it has one. */
let fontDir: string | undefined;

/**
 * The card's font files on disk. They go in a directory of this process's own, made by `mkdtempSync`: a fresh name,
 * open to this user alone. So nothing else on the machine can make it first, or put a font in it for the rasteriser to
 * read, as it could under a fixed name in a shared temp directory. Each file is unpacked whenever it is missing: on the
 * first call, and again after a temp-directory cleaner has emptied the directory, or removed it, under a running
 * server.
 */
export function cardFontFiles(): string[] {
  if (!fontDir || !existsSync(fontDir)) fontDir = mkdtempSync(join(tmpdir(), 'kys-card-fonts-'));
  const dir = fontDir;
  return SOURCES.map(({ family, path }) => {
    const out = join(dir, `${basename(path, '.woff')}.ttf`);
    if (!existsSync(out))
      writeFileSync(out, woffToSfnt(readFileSync(path), family), { mode: 0o600 });
    return out;
  });
}
