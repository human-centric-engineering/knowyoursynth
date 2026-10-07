/**
 * Nothing but the seed and the synth check reads the catalogue's seed data.
 *
 * The data under `prisma/seeds/app-knowyoursynth/data/` is a one-time copy of the prototype's content (D13). After
 * the first seed the tables are the source of truth and admins edit them there (D2). App code that read the files
 * would serve the copy instead of the admin's edit, and nothing would look wrong until someone edited a sound and
 * saw no change. So the only readers are the seed folder itself (the unit and its loader) and
 * `scripts/check-synths.ts`, which has to play what the seed writes.
 *
 * Tests are not scanned: reading the data to check it is what they are for, and they never ship.
 *
 * Like `tests/unit/prototype-boundary.test.ts`, this reads the tree rather than importing what it checks, so it is
 * declared in `lib/app/ci.ts` (`appAlwaysRunTests`) and runs on every scoped run.
 *
 * @see .context/app/planning/app-plan.md §2 (guard 2)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';

const SEED_FOLDER = 'prisma/seeds/app-knowyoursynth/';
const ALLOWED = (path: string) =>
  path.startsWith(SEED_FOLDER) || path === 'scripts/check-synths.ts';

// Any mention of the seed folder in code: an import of the loader or a data file, or a path built to read one
// (`'…/app-knowyoursynth/data'`, or `join('seeds', 'app-knowyoursynth', 'data')`).
const NAMES_SEED_DATA = /seeds[/\\]app-knowyoursynth|['"`]app-knowyoursynth(?:['"`/\\])/;
// A comment line names a path to explain it, not to read it.
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;

function seedDataReferencesIn(source: string): number[] {
  return source
    .split('\n')
    .flatMap((text, index) =>
      !COMMENT.test(text) && NAMES_SEED_DATA.test(text) ? [index + 1] : []
    );
}

const ROOT = process.cwd();
const SOURCE_FILES = globSync(['**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}'], {
  cwd: ROOT,
  ignore: [
    '**/node_modules/**',
    'prototype/**',
    'tests/**',
    '.next/**',
    'coverage/**',
    '**/.cache/**',
  ],
}).sort();

describe('the scan itself', () => {
  it('finds the source tree and both allowed readers, or every assertion below is vacuous', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(500);
    expect(SOURCE_FILES).toContain('scripts/check-synths.ts');
    expect(SOURCE_FILES).toContain(`${SEED_FOLDER}catalogue-data.ts`);
  });

  it('flags every way of reaching the seed data and passes everything else', () => {
    // Assembled at runtime so this file holds no literal offender (and is not one: tests are not scanned anyway).
    const f = 'app-' + 'knowyoursynth';
    const bad = [
      `import { loadCatalogueData } from '@/prisma/seeds/${f}/catalogue-data';`,
      `import sounds from '@/prisma/seeds/${f}/data/sounds/model-d.json';`,
      `const file = join(root, 'prisma', 'seeds', '${f}', 'data');`,
      `readFileSync('prisma/seeds/${f}/data/synths.json');`,
    ];
    const good = [
      `import { seedCatalogue } from '@/lib/app/catalogue/seed';`,
      `import { getSynthDetail } from '@/lib/app/catalogue/read';`,
      `// the seed reads prisma/seeds/${f}/data/`,
      ` * Seeded from prisma/seeds/${f}/data/ by the seed unit.`,
      `const name = 'knowyoursynth';`,
    ];
    expect(seedDataReferencesIn(bad.join('\n'))).toEqual([1, 2, 3, 4]);
    expect(seedDataReferencesIn(good.join('\n'))).toEqual([]);
  });

  it('sees the references the allowed readers really make', () => {
    // If neither reader matched, the pattern would be wrong and the clean result below meaningless.
    for (const path of ['scripts/check-synths.ts', `${SEED_FOLDER}001-catalogue.ts`])
      expect(seedDataReferencesIn(readFileSync(resolve(ROOT, path), 'utf8'))).not.toEqual([]);
  });
});

describe('the catalogue seed data', () => {
  it('is read by nothing but the seed folder and scripts/check-synths.ts', () => {
    const offenders = SOURCE_FILES.filter((path) => !ALLOWED(path)).flatMap((path) =>
      seedDataReferencesIn(readFileSync(resolve(ROOT, path), 'utf8')).map(
        (line) => `${path}:${line}`
      )
    );
    expect(offenders).toEqual([]);
  });
});
