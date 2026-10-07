// Export one synth's content from the prototype to the app's seed data (D13, plan §2).
//   node prototype/tools/export-content.mjs <synth-id> --def-version=N
//
// Writes, under prisma/seeds/app-knowyoursynth/data/:
//   sounds/<id>.json    the library: the definition's own presets, then sounds/<id>.js, in the prototype's order
//   lineage/<id>.json   the lineage file, without "Heard on" (that comes from the databank, f-databank)
//   notes/<id>.json     the "Unusual on…" notes and the synth's "What is not modelled" entry from src/lib/limits.js
//   notes/shared.json   the "What is not modelled" entries that are true of every panel
//   synths.json         the catalogue listing: each exported synth's place in the prototype's picker
//
// Run once per synth, in that synth's port task, and commit the output. The app and the seed never run this:
// after the first seed the database is the source of truth and admins edit it there (D2).
//
// --def-version is the app definition's `version` (lib/app/synths/defs/<id>.ts). Every sound records the version it
// was made on, and the seed refuses a sound whose version has no definition.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const src = path.join(repo, 'prototype', 'src');
const out = path.join(repo, 'prisma', 'seeds', 'app-knowyoursynth', 'data');
const require = createRequire(path.join(repo, 'package.json'));
const esbuild = require('esbuild');
const prettier = require('prettier');

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const versionArg = args.find((a) => a.startsWith('--def-version='));
const version = versionArg ? Number(versionArg.slice('--def-version='.length)) : NaN;
if (!id || !Number.isInteger(version) || version < 1) {
  console.error('usage: node prototype/tools/export-content.mjs <synth-id> --def-version=N');
  process.exit(1);
}
if (!fs.existsSync(path.join(src, 'synths', 'unusual', `${id}.js`))) {
  // The Moog 900 systems build their notes from shared files (p4); this script does not expand those yet.
  console.error(`no src/synths/unusual/${id}.js: this synth's notes are not in the one-file shape this script exports`);
  process.exit(1);
}

const entry = `
export { SYNTHS } from '@/synths/index.js';
export { SHARED, limitsFor } from '@/lib/limits.js';
export { default as unusual } from '@/synths/unusual/${id}.js';
`;
const outFile = path.join(os.tmpdir(), `kys-export.${process.pid}.out.mjs`);
await esbuild.build({
  stdin: { contents: entry, resolveDir: src, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', outfile: outFile, alias: { '@': src }, loader: { '.js': 'jsx' }, logLevel: 'warning',
});
let mod;
try {
  mod = await import(`${pathToFileURL(outFile).href}?t=${Date.now()}`);
} finally {
  fs.rmSync(outFile, { force: true });
}
const { SYNTHS, SHARED, limitsFor, unusual } = mod;

const order = SYNTHS.findIndex((s) => s.id === id);
if (order < 0) {
  console.error(`no synth "${id}" in src/synths/index.js`);
  process.exit(1);
}
const def = SYNTHS[order];
const limits = limitsFor(id);
if (!limits) {
  console.error(`no entry for "${id}" in src/lib/limits.js`);
  process.exit(1);
}

// Formatted as the repo's Prettier would, so a re-export of unchanged content is no diff and \`npm run validate\` passes.
const write = async (rel, data) => {
  const file = path.join(out, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const options = await prettier.resolveConfig(file);
  fs.writeFileSync(file, await prettier.format(JSON.stringify(data), { ...options, filepath: file }));
  console.log(`wrote ${path.relative(repo, file)}`);
};
const pair = ([title, text]) => ({ title, text });

// A JSON round trip drops nothing a sound holds: presets are plain data (CONTRACT.md → Preset).
await write(`sounds/${id}.json`, { synth: id, version, sounds: def.presets });

const { heard: _heard, ...lineage } = def.lineage;
await write(`lineage/${id}.json`, { synth: id, ...lineage });

await write(`notes/${id}.json`, {
  synth: id,
  unusual: Object.entries(unusual).map(([target, text]) => ({ target, text })),
  limits: { intro: limits.intro, items: limits.items.map(pair) },
});
await write('notes/shared.json', { limits: SHARED.map(pair) });

const listingFile = path.join(out, 'synths.json');
const listing = fs.existsSync(listingFile) ? JSON.parse(fs.readFileSync(listingFile, 'utf8')).synths : [];
// A synth already in the listing keeps its place and its listed flag: re-exporting its content must not undo a
// deliberate reorder or unlisting. A new synth takes its place in the prototype's picker.
const listed = listing.find((s) => s.id === id) ?? { id, order, listed: true };
const merged = [...listing.filter((s) => s.id !== id), listed].sort((a, b) => a.order - b.order);
await write('synths.json', { synths: merged });

console.log(`${id}: ${def.presets.length} sounds, ${lineage.timeline.length} lineage entries, ${Object.keys(unusual).length} unusual notes, ${limits.items.length} limits (+${SHARED.length} shared)`);
