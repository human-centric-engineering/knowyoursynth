// Build KnowYourSynth into ONE self-contained HTML file (the artifact page).
// Uses the toolchain already installed in the Sunrise repo: esbuild, React 19, Tailwind 4.
//   node build.mjs [outDir]
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const TOOLCHAIN = process.env.KYS_TOOLCHAIN || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(TOOLCHAIN, 'package.json'));
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, 'src');
const outDir = path.resolve(process.argv[2] || path.join(root, 'dist'));
fs.mkdirSync(outDir, { recursive: true });

const common = {
  bundle: true,
  minify: true,
  target: 'es2020',
  legalComments: 'none',
  write: false,
  alias: { '@': src },
  nodePaths: [path.join(TOOLCHAIN, 'node_modules')],
  logLevel: 'warning',
};

// 1. The AudioWorklet module, bundled stand-alone and embedded as a string.
const worklet = await esbuild.build({ ...common, entryPoints: [path.join(src, 'audio/worklet-entry.js')], format: 'iife' });
const workletSrc = worklet.outputFiles[0].text;

// 1b. The sound-map probe (the same voice, rendered offline in a Worker), embedded the same way.
const probe = await esbuild.build({ ...common, entryPoints: [path.join(src, 'audio/probe-worker-entry.js')], format: 'iife' });
const probeSrc = probe.outputFiles[0].text;

// 2. The app.
const app = await esbuild.build({
  ...common,
  entryPoints: [path.join(src, 'main.jsx')],
  format: 'iife',
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"', __WORKLET_SRC__: JSON.stringify(workletSrc), __PROBE_SRC__: JSON.stringify(probeSrc) },
});
const js = app.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// 3. Tailwind 4 → static CSS (resolved from the toolchain's node_modules, scanning our src).
const cssIn = fs.readFileSync(path.join(src, 'styles.css'), 'utf8').replace('__SRC__', src.replace(/\\/g, '/'));
const css = (await postcss([tailwind({ base: TOOLCHAIN, optimize: { minify: true } })]).process(cssIn, {
  from: path.join(TOOLCHAIN, '__kys.css'),
})).css;

const head = fs.readFileSync(path.join(src, 'head.html'), 'utf8');
const html = `${head}\n<style>${css}</style>\n<div id="root"></div>\n<script>${js}</script>\n`;
fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log(`built ${path.join(outDir, 'index.html')}  js ${(js.length / 1024).toFixed(0)} KB  css ${(css.length / 1024).toFixed(0)} KB`);
