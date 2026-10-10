/**
 * The synth page's bundle holds no definition: each one is a chunk of its own, fetched when the page shows it.
 *
 * Bundles the real page module with esbuild, code-splitting as Next's bundler does at a dynamic `import()`, with a
 * stub second definition added to the loader table. It then walks what the page's entry chunk imports statically
 * (what every visit downloads) and checks that neither definition is in it, while each sits in a chunk of its own.
 * esbuild is not the bundler that ships the page, but the rule tested here, that a dynamic `import()` starts a chunk
 * and a static one does not, is the one both follow.
 *
 * @see lib/app/synths/defs/load.ts
 * @see components/app/synth/synth-page.tsx
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import type { Metafile, Plugin } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ENTRY = 'components/app/synth/synth-page.tsx';
const LOAD = path.join(ROOT, 'lib/app/synths/defs/load.ts');
const MODEL_D = 'lib/app/synths/defs/model-d.ts';
const STUB_ID = 'stub-synth';
const STUB_MARKER = 'STUB_DEFINITION_7f3a';

/** The `@/` alias, resolved as TypeScript would: the path as written, then with each extension, then as a folder. */
function resolveAlias(spec: string): string | null {
  const base = path.join(ROOT, spec.slice(2));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

/** Adds a stub definition to the real loader table, so the page has a second synth it must not carry. */
const withStub: Plugin = {
  name: 'with-stub',
  setup(b) {
    b.onResolve({ filter: new RegExp(`/defs/${STUB_ID}$`) }, () => ({
      path: STUB_ID,
      namespace: 'stub',
    }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `export default { id: '${STUB_ID}', name: '${STUB_MARKER}', version: 1 };`,
      loader: 'ts',
    }));
    b.onLoad({ filter: /defs[/\\]load\.ts$/ }, () => {
      const src = readFileSync(LOAD, 'utf8');
      // The table's opening, whatever its type annotation says.
      const anchor = /const LOADERS\b[^\n]*=\s*\{/;
      if (!anchor.test(src)) throw new Error('load.ts: loader table not found');
      return {
        contents: src.replace(
          anchor,
          (open) => `${open}\n  '${STUB_ID}': () => import('@/lib/app/synths/defs/${STUB_ID}'),`
        ),
        loader: 'ts',
      };
    });
  },
};

const aliasAndExternals: Plugin = {
  name: 'alias-and-externals',
  setup(b) {
    b.onResolve({ filter: /^@\// }, (args) => {
      if (args.path.endsWith(`/defs/${STUB_ID}`)) return undefined;
      const resolved = resolveAlias(args.path);
      if (!resolved) throw new Error(`cannot resolve ${args.path}`);
      return resolved.endsWith('.css') ? { path: args.path, external: true } : { path: resolved };
    });
    b.onResolve({ filter: /^[^./]/ }, (args) => ({ path: args.path, external: true }));
  },
};

let metafile: Metafile;
let entryOutput: string;

beforeAll(async () => {
  const result = await build({
    entryPoints: [path.join(ROOT, ENTRY)],
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    outdir: path.join(ROOT, '.esbuild-out'),
    write: false,
    metafile: true,
    logLevel: 'silent',
    plugins: [withStub, aliasAndExternals],
  });
  metafile = result.metafile;
  const entry = Object.entries(metafile.outputs).find(([, o]) => o.entryPoint?.endsWith(ENTRY));
  if (!entry) throw new Error('no output for the page entry');
  entryOutput = entry[0];
}, 30_000);

/** The page's entry chunk and every chunk it imports statically: what a visit downloads before any `import()`. */
function staticClosure(start: string): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const out = queue.pop()!;
    if (seen.has(out)) continue;
    seen.add(out);
    for (const imp of metafile.outputs[out].imports) {
      if (imp.kind === 'import-statement' && !imp.external) queue.push(imp.path);
    }
  }
  return seen;
}

const inputsOf = (outputs: Iterable<string>) =>
  [...outputs].flatMap((o) => Object.keys(metafile.outputs[o].inputs));

const isStub = (input: string) => input.includes(STUB_ID);
const isModelD = (input: string) => input.endsWith(MODEL_D);

describe('synth page bundle', () => {
  it('builds the page with both definitions somewhere in the output', () => {
    // Without this, the checks below pass on a build that dropped the definitions altogether.
    const all = inputsOf(Object.keys(metafile.outputs));
    expect(all.some(isModelD)).toBe(true);
    expect(all.some(isStub)).toBe(true);
    expect(inputsOf(staticClosure(entryOutput)).some((i) => i.endsWith(ENTRY))).toBe(true);
  });

  it('carries neither definition in what the page loads up front', () => {
    const upFront = inputsOf(staticClosure(entryOutput));
    expect(upFront.filter((i) => isModelD(i) || isStub(i))).toEqual([]);
  });

  it('puts each definition in a chunk the page reaches only by a dynamic import', () => {
    const upFront = staticClosure(entryOutput);
    for (const isDef of [isModelD, isStub]) {
      const chunks = Object.entries(metafile.outputs)
        .filter(([, o]) => Object.keys(o.inputs).some(isDef))
        .map(([p]) => p);
      expect(chunks).toHaveLength(1);
      expect(upFront.has(chunks[0])).toBe(false);
      const reachedBy = Object.values(metafile.outputs).flatMap((o) =>
        o.imports.filter((imp) => imp.path === chunks[0]).map((imp) => imp.kind)
      );
      expect(reachedBy).toContain('dynamic-import');
      expect(reachedBy).not.toContain('import-statement');
    }
  });

  it('keeps the stub out of the Model D chunk, and Model D out of the stub’s', () => {
    for (const [, o] of Object.entries(metafile.outputs)) {
      const inputs = Object.keys(o.inputs);
      expect(inputs.some(isModelD) && inputs.some(isStub)).toBe(false);
    }
  });
});
