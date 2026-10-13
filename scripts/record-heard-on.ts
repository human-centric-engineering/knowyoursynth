/**
 * Records every synth's "Heard on" list as the prototype builds it (`heardFor()` in `src/bank/index.js`), into
 * `tests/fixtures/bank/heard-on.json`. The databank's port is held to it: the joins over the seed data and the read
 * layer over the tables must give the same lists (`f-databank` b1).
 *
 *   npx tsx scripts/record-heard-on.ts               writes the file if there is none
 *   npx tsx scripts/record-heard-on.ts --rerecord    overwrites it
 *
 * Run once, and commit the file. The prototype is the spec (D3), so it is never re-recorded to make a port pass; pass
 * `--rerecord` only when the recording's format changes. Like `check:synths`, this bundles the prototype when it runs
 * (`scripts/prototype-synths.ts`), whose synth index fills each lineage's `heard` from the databank.
 *
 * Printing goes through `console`, not `logger` — see the `scripts/**` override in `eslint.config.mjs`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { loadPrototypeSynths } from '@/scripts/prototype-synths';

export const HEARD_ON_FILE = join(
  resolve(import.meta.dirname, '..'),
  'tests',
  'fixtures',
  'bank',
  'heard-on.json'
);

/** Record the file at `out`. Exported for its test; run from the command line, it records `HEARD_ON_FILE`. */
export async function recordHeardOn(args: string[], OUT = HEARD_ON_FILE): Promise<void> {
  if (existsSync(OUT) && !args.includes('--rerecord'))
    throw new Error(
      `${OUT} is already recorded. A port that differs from it is the port's to fix (D3)`
    );
  const heard = Object.fromEntries(
    (await loadPrototypeSynths())
      .map((d) => [d.id, d.lineage?.heard ?? []] as const)
      .sort(([a], [b]) => (a < b ? -1 : 1))
  );
  mkdirSync(dirname(OUT), { recursive: true });
  const options = await resolveConfig(OUT);
  // A JSON round trip drops the keys the prototype set to undefined (`year`, `sound`), as the API does.
  writeFileSync(OUT, await format(JSON.stringify(heard), { ...options, filepath: OUT }));
  const counts = Object.entries(heard).map(([id, list]) => `${id} ${list.length}`);
  console.log(`wrote ${counts.length} synths: ${counts.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  recordHeardOn(process.argv.slice(2)).catch((error: unknown) => {
    console.log('ERR', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
