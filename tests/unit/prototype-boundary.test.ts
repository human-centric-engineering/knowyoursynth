/**
 * Nothing outside `prototype/` imports from it.
 *
 * `prototype/` is the original single-file artefact, kept only as the reference the app is
 * ported from (D13). It is removed when the app launches, so any import of it from app code is
 * a break waiting for that day. It also escapes every gate: `prototype/` is excluded from
 * tsconfig, ESLint and Prettier, so an import would bring untyped, unlinted code into the app
 * without any check noticing. The port copies code across. It never reaches in.
 *
 * This test reads the tree rather than any module it imports, so no import chain connects it
 * to the files it checks. That is why it is declared in `lib/app/ci.ts` (`appAlwaysRunTests`)
 * and runs on every scoped run.
 *
 * @see .context/app/planning/app-plan.md (D13)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';

// A module specifier (static or dynamic import, re-export, require) naming a `prototype`
// path segment: `@/prototype/...`, `../../prototype/src/...`, `prototype/check.mjs`.
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"`])([^'"`]*)\1/g;
const NAMES_PROTOTYPE = /(?:^|[/@])prototype(?:\/|$)/;

interface Occurrence {
  line: number;
  specifier: string;
}

function prototypeImportsIn(source: string): Occurrence[] {
  const found: Occurrence[] = [];
  source.split('\n').forEach((text, index) => {
    for (const match of text.matchAll(SPECIFIER)) {
      if (NAMES_PROTOTYPE.test(match[2])) found.push({ line: index + 1, specifier: match[2] });
    }
  });
  return found;
}

const ROOT = process.cwd();
const SOURCE_FILES = globSync(['**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}'], {
  cwd: ROOT,
  ignore: ['**/node_modules/**', 'prototype/**', '.next/**', 'coverage/**', '**/.cache/**'],
}).sort();

describe('the scan itself', () => {
  it('finds the source tree, or every assertion below is vacuous', () => {
    // A glob that matches nothing reports a clean tree. The floor is a vacuity check, not a census.
    expect(SOURCE_FILES.length).toBeGreaterThan(500);
    expect(SOURCE_FILES.some((path) => path.startsWith('prototype/'))).toBe(false);
  });

  it('flags every way of reaching into prototype/ and passes everything else', () => {
    // Proves the detector can report before a clean result is trusted. The sentinels are
    // assembled at runtime so this file does not contain a literal offender itself.
    const p = 'proto' + 'type';
    const bad = [
      `import { SYNTHS } from '@/${p}/src/synths/index.js';`,
      `import x from "../../${p}/src/audio/dsp-core.js";`,
      `export { createSynth } from '../${p}/src/audio/dsp-core.js';`,
      `const m = await import('@/${p}/src/lib/patch.js');`,
      `const { run } = require('./${p}/check.mjs');`,
      `import '${p}/src/styles.css';`,
    ];
    const good = [
      `import { logger } from '@/lib/logging';`,
      `const has = Object.${p}.hasOwnProperty.call(a, 'b');`,
      `import { prototypeData } from '@/lib/app/prototype-data';`,
      `// ported from ${p}/src/lib/patch.js`,
      `const ignores = ['${p}/**'];`,
    ];
    expect(prototypeImportsIn(bad.join('\n')).map((o) => o.line)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(prototypeImportsIn(good.join('\n'))).toEqual([]);
  });
});

describe('prototype/', () => {
  it('is imported by no file outside it', () => {
    const offenders = SOURCE_FILES.flatMap((path) =>
      prototypeImportsIn(readFileSync(resolve(ROOT, path), 'utf8')).map(
        (o) => `${path}:${o.line} imports ${o.specifier}`
      )
    );
    expect(offenders).toEqual([]);
  });
});
