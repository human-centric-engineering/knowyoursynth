/**
 * Definition registry tests: what the registry serves, the content ruling (D13), and the brand
 * tags the neutral design depends on (D11).
 *
 * @see lib/app/synths/defs/index.ts
 * @see lib/app/synths/defs/load.ts
 * @see lib/app/synths/defs/model-d.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Decor } from '@/lib/app/synths/contract';
import { getSynthDef, SYNTH_DEFS } from '@/lib/app/synths/defs';
import { LOADABLE_SYNTH_IDS, loadedSynthDef, loadSynthDef } from '@/lib/app/synths/defs/load';

const DEFS_DIR = path.join(process.cwd(), 'lib/app/synths/defs');

/** Every `.ts` file under `lib/app/synths/defs/`, recursively. */
function defSources(dir = DEFS_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return defSources(full);
    return e.name.endsWith('.ts') ? [full] : [];
  });
}

/**
 * The ways content gets into a definition module: importing a content file, keeping a sound list
 * or a lineage on the definition, or writing unusual notes onto its controls. Content belongs in
 * the catalogue tables (D13).
 */
const CONTENT_PATTERNS: { what: string; re: RegExp }[] = [
  {
    what: 'imports a content file',
    re: /from\s+['"][^'"]*\/(sounds|lineage|unusual|limits|data)\b[^'"]*['"]/,
  },
  { what: 'carries presets', re: /^\s*presets\s*[:,]/m },
  { what: 'carries a lineage', re: /^\s*lineage\s*[:,]/m },
  { what: 'writes unusual notes', re: /\bannotate\(|^\s*unusual\s*:/m },
];

const contentFound = (src: string): string[] =>
  CONTENT_PATTERNS.filter((p) => p.re.test(src)).map((p) => p.what);

describe('definition registry', () => {
  it('serves Model D by id, and null for an id no synth has', () => {
    expect(getSynthDef('model-d')?.name).toBe('Model D');
    expect(getSynthDef('minimoog')).toBeNull();
  });

  it('gives every definition a unique id and a whole-number version from 1', () => {
    expect(SYNTH_DEFS.length).toBeGreaterThan(0);
    expect(new Set(SYNTH_DEFS.map((d) => d.id)).size).toBe(SYNTH_DEFS.length);
    for (const def of SYNTH_DEFS) {
      expect(Number.isInteger(def.version), def.id).toBe(true);
      expect(def.version, def.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('builds each init patch from every control’s default', () => {
    for (const def of SYNTH_DEFS) {
      expect(Object.keys(def.init).sort(), def.id).toEqual(def.controls.map((c) => c.id).sort());
      for (const c of def.controls) expect(def.init[c.id], `${def.id} ${c.id}`).toBe(c.def);
    }
  });
});

describe('per-synth loader', () => {
  it('has a loader for every registered definition, and none for anything else', () => {
    expect([...LOADABLE_SYNTH_IDS].sort()).toEqual(SYNTH_DEFS.map((d) => d.id).sort());
  });

  it('loads the same definition the registry holds', async () => {
    for (const def of SYNTH_DEFS) await expect(loadSynthDef(def.id), def.id).resolves.toBe(def);
  });

  it('returns one promise per id, and has the definition at hand once it has loaded', async () => {
    const first = loadSynthDef('model-d');
    expect(loadSynthDef('model-d')).toBe(first);
    await first;
    expect(loadedSynthDef('model-d')).toBe(getSynthDef('model-d'));
  });

  it('has no loader for an id no synth has, inherited names included', () => {
    expect(loadSynthDef('minimoog')).toBeNull();
    expect(loadSynthDef('constructor')).toBeNull();
    expect(loadedSynthDef('minimoog')).toBeUndefined();
  });
});

describe('no content in a definition (D13)', () => {
  it('holds no sounds, lineage or unusual notes on any registered definition', () => {
    for (const def of SYNTH_DEFS) {
      expect(def.presets, def.id).toBeUndefined();
      expect(def.lineage, def.id).toBeUndefined();
      const annotated = [...def.controls, ...def.jacks, ...def.areas].filter(
        (x) => x.unusual !== undefined
      );
      expect(
        annotated.map((x) => x.id),
        def.id
      ).toEqual([]);
    }
  });

  it('finds no content in any module under defs/', () => {
    const sources = defSources();
    expect(sources.length).toBeGreaterThan(1);
    const offenders = sources.flatMap((file) =>
      contentFound(readFileSync(file, 'utf8')).map(
        (what) => `${path.relative(process.cwd(), file)} ${what}`
      )
    );
    expect(offenders).toEqual([]);
  });

  it('would catch each way content can get in', () => {
    // Each pattern must fire on the shape it exists for, or the scan above passes for free.
    expect(contentFound("import moreSounds from '@/synths/sounds/model-d.js';")).toEqual([
      'imports a content file',
    ]);
    expect(
      contentFound("import notes from '@/prisma/seeds/app-knowyoursynth/data/x.json';")
    ).toEqual(['imports a content file']);
    expect(contentFound('  presets: [...presets, ...moreSounds],')).toEqual(['carries presets']);
    expect(contentFound('  lineage,')).toEqual(['carries a lineage']);
    expect(contentFound('annotate(unusual, controls, jacks, areas);')).toEqual([
      'writes unusual notes',
    ]);
    expect(contentFound("  unusual: 'EMPHASIS is Moog’s word for resonance.',")).toEqual([
      'writes unusual notes',
    ]);
  });
});

describe('brand marks (D11)', () => {
  const brandItems = (decor: Decor[]) => decor.filter((d) => d.brand === true);

  it('tags Model D’s two logos, and nothing else', () => {
    const def = getSynthDef('model-d');
    expect(def).not.toBeNull();
    expect(brandItems(def!.decor)).toEqual([
      expect.objectContaining({ t: 'logo', style: 'outline-d' }),
      expect.objectContaining({ t: 'logo', style: 'behringer', text: 'behringer' }),
    ]);
  });

  it('tags every logo on every definition', () => {
    const logos = SYNTH_DEFS.flatMap((def) =>
      def.decor.filter((d) => d.t === 'logo').map((d) => ({ id: def.id, d }))
    );
    expect(logos.length).toBeGreaterThan(0);
    for (const { id, d } of logos) expect(d.brand, `${id} logo at ${d.x},${d.y}`).toBe(true);
  });
});
