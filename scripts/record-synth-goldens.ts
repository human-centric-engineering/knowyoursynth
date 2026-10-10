/**
 * Records a ported synth's golden values from the prototype's definition, into
 * `tests/fixtures/synths/goldens/<id>.json` (see `scripts/synth-goldens.ts` for what is recorded and why).
 *
 *   npx tsx scripts/record-synth-goldens.ts                     every registered synth that has no goldens yet
 *   npx tsx scripts/record-synth-goldens.ts <id> ...            only these, if they have no goldens yet
 *   npx tsx scripts/record-synth-goldens.ts --rerecord <id> ... these, overwriting their goldens
 *
 * Run it once when a synth is ported, and commit the file. The prototype is the spec (D3), so the goldens are never
 * re-recorded to make a port pass: a mismatch is a port that differs from the prototype. An existing file is
 * therefore never overwritten unless `--rerecord` names it — for when the recording's format changes, or the
 * prototype changes on purpose, never to make a port pass. The file is written through Prettier, so it is committed
 * as recorded. Like `check:synths`, this bundles the prototype when it runs (`scripts/prototype-synths.ts`).
 *
 * Printing goes through `console`, not `logger` — see the `scripts/**` override in `eslint.config.mjs`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { SYNTH_DEFS } from '@/lib/app/synths/defs';
import { loadPrototypeSynths } from '@/scripts/prototype-synths';
import { recordGoldens } from '@/scripts/synth-goldens';

const OUT_DIR = join(resolve(import.meta.dirname, '..'), 'tests', 'fixtures', 'synths', 'goldens');

async function main(args: string[]): Promise<void> {
  const rerecord = args.includes('--rerecord');
  const ids = args.filter((a) => a !== '--rerecord');
  if (rerecord && !ids.length)
    throw new Error('--rerecord needs the ids of the synths to re-record');
  const file = (id: string): string => join(OUT_DIR, `${id}.json`);
  const wanted = ids.length
    ? ids
    : SYNTH_DEFS.map((d) => d.id).filter((id) => !existsSync(file(id)));
  if (!rerecord) {
    const recorded = wanted.filter((id) => existsSync(file(id)));
    if (recorded.length)
      throw new Error(
        `already recorded: ${recorded.join(', ')}. A port that differs from these is the port's to fix (D3); pass --rerecord only when the recording itself has to change`
      );
  }
  if (!wanted.length) {
    console.log('every registered synth has its goldens');
    return;
  }

  const prototypes = new Map((await loadPrototypeSynths()).map((d) => [d.id, d]));
  mkdirSync(OUT_DIR, { recursive: true });
  for (const id of wanted) {
    const def = prototypes.get(id);
    if (!def) throw new Error(`the prototype has no synth ${id}`);
    const goldens = recordGoldens(def);
    const options = await resolveConfig(file(id));
    writeFileSync(
      file(id),
      await format(JSON.stringify(goldens), { ...options, filepath: file(id) })
    );
    console.log(
      `${id}: ${Object.keys(goldens.readouts).length} readouts, ${Object.keys(goldens.engine).length} engine settings, ${Object.keys(goldens.checks).length} checks, ${Object.keys(goldens.depths).length} depths, ${Object.keys(goldens.hears).length} hears`
    );
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.log('ERR', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
