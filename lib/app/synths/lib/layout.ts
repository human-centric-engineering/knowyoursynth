// The layouts a panel can be drawn in besides its long faceplate. Each cuts the long panel into pieces and puts them
// down somewhere else; the sound, the ids and the presets are untouched, so everything that reads a SynthDef (search,
// sections, sound map, tour, cables, routing crops) works on the result as it does on the long panel.
//
// - modular (the Jupiters): the cuts become modules, stacked in rows in a case. `modularDef(def)`.
// - compact: the cuts are put down on one faceplate, and what no piece cuts (a keybed the app's keyboard replaces, a
//   band with no controls) is left out. `compactDef(def)`.
//
// `layoutDef(def, long)` is the one every surface that draws a panel calls: the synth's own layout, or with `long`
// (the Layout setting's Long) the full faceplate.
//
// The modular layout is transliterated from the prototype file `src/lib/layout.js` (decision D3); the compact one is
// the app's own (`f-compact-panels` t-229).
import type {
  CompactLayout,
  Control,
  ControlOption,
  Decor,
  Jack,
  ModularLayout,
  ModulePlate,
  SynthDef,
  ViewRect,
} from '@/lib/app/synths/contract';
import { faceView } from '@/lib/app/synths/lib/patch';

const PLATE = { t: 26, b: 30, s: 12 }; // plate margin round each module's cut: room for the screws and the module name
const GAP = 8; // between modules in a row
const ROW_GAP = 26; // between rows: the case rail shows through
const EDGE = 22; // case border
const BLANK_MIN = 200; // narrowest blank panel worth drawing

/** A module's (or piece's) cut on the long panel, and (once placed) its plate and its offset into the case. */
interface Module {
  name?: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
  plate: ViewRect;
  dx: number;
  dy: number;
}

interface Row {
  y: number;
  h: number;
  inner: number;
  cuts: Module[];
  end: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const within = (m: Module, x: number, y: number) => x >= m.x0 && x < m.x1 && y >= m.y0 && y < m.y1;

/** Clip a segment to a rect (Liang–Barsky); null if it misses. */
function clipLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  m: Module
): [number, number, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const edges = [
    [-dx, x1 - m.x0],
    [dx, m.x1 - x1],
    [-dy, y1 - m.y0],
    [dy, m.y1 - y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  if (t1 - t0 < 1e-6 && (dx || dy)) return null;
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

/** The overlap of two rects, or null when they share less than half a unit each way (touching is not overlapping). */
export function overlap(a: ViewRect, b: ViewRect): ViewRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0.5 && h > 0.5 ? { x, y, w, h } : null;
}

/** A module's cut as a rect on the long panel. */
const cutRect = (m: Module): ViewRect => ({ x: m.x0, y: m.y0, w: m.w, h: m.h });

/** The overlap of a rect { x, y, w, h } with a module cut, or null. */
const clipRect = (r: ViewRect, m: Module): ViewRect | null => overlap(r, cutRect(m));

/** Lay the rows out: each module gets its plate, and its cut's offset into the case. */
function place(spec: ModularLayout) {
  const rows: Row[] = [];
  let y = EDGE;
  spec.rows.forEach((row) => {
    const cuts = row.map((m): Module => {
      const [x0, y0, x1, y1] = m.cut;
      // `plate`, `dx` and `dy` are filled in below, once the row's width is known.
      return {
        ...m,
        x0,
        y0,
        x1,
        y1,
        w: x1 - x0,
        h: y1 - y0,
        plate: { x: 0, y: 0, w: 0, h: 0 },
        dx: 0,
        dy: 0,
      };
    });
    const inner = Math.max(...cuts.map((c) => c.h));
    const end = EDGE + cuts.reduce((n, c) => n + c.w + PLATE.s * 2, 0) + GAP * (cuts.length - 1);
    rows.push({ y, h: inner + PLATE.t + PLATE.b, inner, cuts, end });
    y += inner + PLATE.t + PLATE.b + ROW_GAP;
  });
  const w = Math.max(...rows.map((r) => r.end)) + EDGE;
  const blanks: ViewRect[] = [];
  rows.forEach((r) => {
    // A row a little short of the full width spreads the difference over its modules; a row well short is made up
    // with a blank panel, as in a real case.
    const left = w - EDGE - r.end;
    const spread = left < BLANK_MIN ? left / r.cuts.length : 0;
    let x = EDGE;
    r.cuts.forEach((c) => {
      c.plate = { x, y: r.y, w: c.w + PLATE.s * 2 + spread, h: r.h };
      c.dx = x + PLATE.s + spread / 2 - c.x0; // the cut sits in the middle of its plate
      c.dy = r.y + PLATE.t + (r.inner - c.h) / 2 - c.y0;
      x += c.plate.w + GAP;
    });
    if (!spread && left > 0) blanks.push({ x: r.end + GAP, y: r.y, w: left - GAP, h: r.h });
  });
  return { rows, blanks, view: { w: r1(w), h: r1(y - ROW_GAP + EDGE) } };
}

function moveDecor(d: Decor, mods: Module[], out: Decor[]): void {
  if (d.t === 'line') {
    mods.forEach((m) => {
      const c = clipLine(d.x1, d.y1, d.x2, d.y2, m);
      if (c)
        out.push({
          ...d,
          x1: r1(c[0] + m.dx),
          y1: r1(c[1] + m.dy),
          x2: r1(c[2] + m.dx),
          y2: r1(c[3] + m.dy),
        });
    });
    return;
  }
  if (d.t === 'rect' || d.t === 'frame') {
    // A print rect that crosses a cut is split: each module keeps its own part (a hatch bar, a name bar).
    mods.forEach((m) => {
      const c = clipRect(d, m);
      if (!c) return;
      const whole = c.w === d.w && c.h === d.h;
      out.push({
        ...d,
        x: r1(c.x + m.dx),
        y: r1(c.y + m.dy),
        w: r1(c.w),
        h: r1(c.h),
        ...(whole ? {} : { r: 0 }),
      });
    });
    return;
  }
  if (d.t === 'path') {
    const [x, y] = (d.d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    const m = mods.find((k) => within(k, x, y));
    if (m) out.push({ ...d, shift: [m.dx, m.dy] });
    return;
  }
  const m = mods.find((k) => within(k, d.x, d.y));
  if (m) out.push({ ...d, x: r1(d.x + m.dx), y: r1(d.y + m.dy) });
}

/**
 * Every control, option, jack, decor item, area, mark and the pin matrix of `def`, moved by the cut it sits in. A
 * control, jack or matrix in no cut throws (`<id> <what>: control <id> at x,y is in no <unit>`), as does a matrix whose
 * far corner is in another cut than its first hole; decor, area parts and marks (by their centre) in no cut are dropped.
 */
function moveAll(
  def: SynthDef,
  mods: Module[],
  what: string,
  unit: string
): Pick<SynthDef, 'controls' | 'jacks' | 'decor' | 'areas' | 'marks' | 'matrix'> {
  const at = (p: { x: number; y: number }, thing: string) => {
    const m = mods.find((k) => within(k, p.x, p.y));
    if (!m) throw new Error(`${def.id} ${what}: ${thing} at ${p.x},${p.y} is in no ${unit}`);
    return m;
  };
  const move = (p: { x: number; y: number }, thing: string) => {
    const m = at(p, thing);
    return { x: r1(p.x + m.dx), y: r1(p.y + m.dy) };
  };
  const moveOption = (c: Control, o: ControlOption): ControlOption =>
    o.x != null && o.y != null ? { ...o, ...move({ x: o.x, y: o.y }, `option ${c.id}=${o.v}`) } : o;

  const controls = def.controls.map((c): Control => {
    const moved: Control = { ...c, ...move(c, `control ${c.id}`) };
    if (moved.kind === 'enum' && moved.options.some((o) => o.x != null))
      return { ...moved, options: moved.options.map((o) => moveOption(c, o)) };
    return moved;
  });
  const jacks = def.jacks.map((j): Jack => ({ ...j, ...move(j, `jack ${j.id}`) }));
  const decor: Decor[] = [];
  def.decor.forEach((d) => moveDecor(d, mods, decor));
  const areas = (def.areas || []).map((a) => ({
    ...a,
    rects: a.rects.flatMap((r) =>
      mods
        .map((m) => {
          const c = clipRect(r, m);
          return c && { x: r1(c.x + m.dx), y: r1(c.y + m.dy), w: r1(c.w), h: r1(c.h) };
        })
        .filter((x): x is ViewRect => !!x)
    ),
  }));
  const marks = def.marks?.flatMap((k) => {
    const m = mods.find((c) => within(c, k.rect.x + k.rect.w / 2, k.rect.y + k.rect.h / 2));
    return m ? [{ ...k, rect: { ...k.rect, x: r1(k.rect.x + m.dx), y: r1(k.rect.y + m.dy) } }] : [];
  });
  let matrix = def.matrix;
  if (matrix) {
    const m = at(matrix, 'matrix');
    const far = {
      x: matrix.x + matrix.pitch * (matrix.cols.length - 1),
      y: matrix.y + matrix.pitch * (matrix.rows.length - 1),
    };
    if (!within(m, far.x, far.y))
      throw new Error(`${def.id} ${what}: the matrix runs out of its ${unit} at ${far.x},${far.y}`);
    matrix = { ...matrix, x: r1(matrix.x + m.dx), y: r1(matrix.y + m.dy) };
  }
  return {
    controls,
    jacks,
    decor,
    areas,
    ...(marks ? { marks } : {}),
    ...(matrix ? { matrix } : {}),
  };
}

const cache = new WeakMap<SynthDef, SynthDef>();

/** The modular form of a SynthDef that has a `modular` spec; the def itself when it has none. */
export function modularDef(def: SynthDef): SynthDef {
  if (!def.modular) return def;
  const hit = cache.get(def);
  if (hit) return hit;
  const lay = place(def.modular);
  const mods = lay.rows.flatMap((r) => r.cuts);
  const plates: ModulePlate[] = mods.map((m) => ({ ...m.plate, name: m.name }));

  // The prototype stripped its `_` cache keys off the definition here; the caches now live in WeakMaps, so a plain
  // copy carries nothing that belongs to the long panel.
  const out: SynthDef = {
    ...def,
    ...moveAll(def, mods, 'modular', 'module'),
    view: lay.view,
    theme: { ...def.theme, cheeks: 'none' },
    layout: {
      kind: 'modular',
      plates,
      blanks: lay.blanks,
      brand: def.modular.brand || def.name,
    },
  };
  cache.set(def, out);
  return out;
}

/**
 * The pieces of a compact spec as modules: each cut, and its offset to where it is put down on the faceplate `face`.
 * Throws when a piece is put down left of or above the faceplate's corner, or when two pieces overlap, either as cut
 * from the long panel (that part would be drawn twice) or as put down.
 */
function pieces(def: SynthDef, spec: CompactLayout, face: { x: number }): Module[] {
  const mods = spec.pieces.map(({ cut: [x0, y0, x1, y1], at: [ax, ay] }, i): Module => {
    if (ax < 0 || ay < 0)
      throw new Error(
        `${def.id} compact: piece ${i} is put down outside the faceplate, at ${ax},${ay}`
      );
    const plate = { x: face.x + ax, y: ay, w: x1 - x0, h: y1 - y0 };
    return { x0, y0, x1, y1, w: plate.w, h: plate.h, plate, dx: plate.x - x0, dy: plate.y - y0 };
  });
  mods.forEach((a, i) =>
    mods.slice(i + 1).forEach((b, j) => {
      const which = `pieces ${i} and ${i + j + 1}`;
      if (overlap(cutRect(a), cutRect(b)))
        throw new Error(`${def.id} compact: ${which} cut the same part of the panel`);
      if (overlap(a.plate, b.plate)) throw new Error(`${def.id} compact: ${which} overlap`);
    })
  );
  return mods;
}

const compactCache = new WeakMap<SynthDef, SynthDef>();

/**
 * The compact form of a SynthDef that has a `compact` spec; the def itself when it has none. One faceplate, the box
 * round the pieces as they are put down, with the definition's own end cheeks either side; no case.
 */
export function compactDef(def: SynthDef): SynthDef {
  if (!def.compact) return def;
  const hit = compactCache.get(def);
  if (hit) return hit;
  const face = faceView(def);
  const mods = pieces(def, def.compact, face);
  const w = Math.max(0, ...mods.map((m) => m.plate.x + m.w - face.x));
  const h = Math.max(0, ...mods.map((m) => m.plate.y + m.h));
  const out: SynthDef = {
    ...def,
    ...moveAll(def, mods, 'compact', 'piece'),
    view: { w: r1(w + face.x * 2), h: r1(h) },
  };
  compactCache.set(def, out);
  return out;
}

/** Which layout a synth opens in besides the long faceplate, if it has one. */
export function layoutKind(def: SynthDef): 'modular' | 'compact' | null {
  if (def.modular) return 'modular';
  if (def.compact) return 'compact';
  return null;
}

/**
 * The definition a panel is drawn from: the synth's own layout (modular or compact), or with `long` the full
 * faceplate as defined. Every surface that draws a panel (the synth page, the share card and hero, the routing crops)
 * goes through this, so they all draw the same one. Only positions and the view differ from `def`.
 */
export function layoutDef(def: SynthDef, long = false): SynthDef {
  if (long) return def;
  if (def.modular) return modularDef(def);
  if (def.compact) return compactDef(def);
  return def;
}
