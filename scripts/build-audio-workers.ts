/**
 * Bundle the sound engine's two off-main-thread entry points into static files Next serves.
 *
 *   lib/app/synths/audio/worklet-entry.ts       → public/worklets/kys-voice.js  (the AudioWorklet, WORKLET_URL)
 *   lib/app/synths/audio/probe-worker-entry.ts  → public/worklets/kys-probe.js  (the sound-map Worker, PROBE_WORKER_URL)
 *
 * The prototype embedded both as strings in its one HTML file (`prototype/build.mjs`, `__WORKLET_SRC__` /
 * `__PROBE_SRC__`). An AudioWorklet module and a Worker script are each loaded by URL and run in their own global
 * scope, so they cannot be ordinary Next chunks: each is bundled stand-alone, with everything it imports, as one IIFE.
 *
 * Runs before `npm run build` (the `prebuild` script), and under `npm run dev` (below). The outputs are build products
 * and are gitignored.
 *
 * `npm run dev` also runs it in watch mode around the Next dev server (t-248): Next does not bundle these files, so
 * without the watcher an engine change merged while the server runs never reaches the browser, and a sound that
 * needs it plays silent on the old bundle. Watching, esbuild rebuilds both on any change to what they import; a
 * page reload loads the new bundle. The command after `--` runs as a child, and the watcher ends when it does.
 *
 * Usage:
 *   npx tsx scripts/build-audio-workers.ts                         one build
 *   npx tsx scripts/build-audio-workers.ts --watch -- <command…>   build, rebuild on change, run <command> meanwhile
 *
 * Printing goes through `console`, not `logger` — see the `scripts/**` override in `eslint.config.mjs`.
 */

import { spawn } from 'node:child_process';
import { context, type BuildContext, type BuildOptions, type Plugin } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'worklets');

/** Entry → output file name. The URLs the app loads them from are WORKLET_URL and PROBE_WORKER_URL. */
const AUDIO_WORKERS: { entry: string; out: string }[] = [
  { entry: 'lib/app/synths/audio/worklet-entry.ts', out: 'kys-voice.js' },
  { entry: 'lib/app/synths/audio/probe-worker-entry.ts', out: 'kys-probe.js' },
];

/** Both bundles from one esbuild context: one build, and in watch mode one watcher and one rebuild per change. */
function options(plugins: Plugin[]): BuildOptions {
  return {
    entryPoints: Object.fromEntries(
      AUDIO_WORKERS.map(({ entry, out }) => [out.replace(/\.js$/, ''), join(ROOT, entry)])
    ),
    outdir: OUT_DIR,
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2020',
    legalComments: 'none',
    // `@/…` resolves through tsconfig.json's `paths`, which esbuild reads from the project root.
    tsconfig: join(ROOT, 'tsconfig.json'),
    logLevel: 'warning',
    plugins,
  };
}

/**
 * Says when the watched bundles are rebuilt, and whether they built. Not for the first two builds: `main`'s own,
 * which it reports, and the one `watch()` starts with (esbuild 0.28 runs one; check this count on an upgrade).
 */
function reportRebuilds(): Plugin {
  let quiet = 2;
  return {
    name: 'report-rebuilds',
    setup(b) {
      b.onEnd((result) => {
        if (quiet > 0) {
          quiet -= 1;
          return;
        }
        console.log(
          result.errors.length === 0
            ? `audio workers rebuilt in ${relative(ROOT, OUT_DIR)} (reload the page to hear it)`
            : 'audio workers failed to rebuild; the last good bundles stay'
        );
      });
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dash = args.indexOf('--');
  const flags = dash >= 0 ? args.slice(0, dash) : args;
  const command = dash >= 0 ? args.slice(dash + 1) : [];
  const watch = flags.includes('--watch');
  if (watch !== command.length > 0) throw new Error('--watch and a command after -- go together');

  mkdirSync(OUT_DIR, { recursive: true });
  const ctx: BuildContext = await context(options(watch ? [reportRebuilds()] : []));
  // The first build is awaited either way: a broken engine fails the start, as it did before watching.
  await ctx.rebuild();
  for (const { entry, out } of AUDIO_WORKERS) {
    console.log(`audio worker: ${entry} → ${relative(ROOT, join(OUT_DIR, out))}`);
  }
  if (!watch) {
    await ctx.dispose();
    return;
  }
  await ctx.watch();

  const [bin, ...rest] = command;
  const child = spawn(bin, rest, { cwd: ROOT, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => child.kill(signal));
  }
  // If this process dies some other way (an uncaught error), take the dev server with it rather than orphan it on
  // its port. A no-op once the child has exited.
  process.on('exit', () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  });
  child.on('error', (err) => {
    console.error(`build-audio-workers: could not start ${bin}: ${err.message}`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    void ctx.dispose().finally(() => {
      // The child's signal is the shell's to see, as a normal Ctrl-C rather than exit 0.
      if (signal) {
        process.removeAllListeners(signal);
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 1);
    });
  });
}

main().catch((err: unknown) => {
  console.error('build-audio-workers failed:', err);
  process.exit(1);
});
