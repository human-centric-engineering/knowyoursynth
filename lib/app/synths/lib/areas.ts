// Areas: the named regions of a faceplate (one or more rects each) that the Areas view and the search explain.
//
// Transliterated from `prototype/src/lib/areas.js` (decision D3). The prototype cached the area table on the
// definition (`def._amap`); here it is a WeakMap keyed by the definition.
import { cleanLabel, displayName } from '@/lib/app/synths/lib/patch';
import { jackName } from '@/lib/app/synths/lib/explain';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import type { Area, Control, Jack, SynthDef, ViewRect } from '@/lib/app/synths/contract';

const inside = (a: Area, p: { x: number; y: number }) =>
  a.rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);

const areaMaps = new WeakMap<SynthDef, Record<string, Area | undefined>>();

export function areaMap(def: SynthDef): Record<string, Area | undefined> {
  let m = areaMaps.get(def);
  if (!m) {
    m = Object.fromEntries((def.areas || []).map((a) => [a.id, a]));
    areaMaps.set(def, m);
  }
  return m;
}

/** The area a control or jack sits in, or null. */
export const areaOf = (def: SynthDef, p: { x: number; y: number }): Area | null =>
  (def.areas || []).find((a) => inside(a, p)) || null;

/** Everything that sits inside an area. */
export function areaMembers(def: SynthDef, area: Area): { controls: Control[]; jacks: Jack[] } {
  return {
    controls: def.controls.filter((c) => inside(area, c)),
    jacks: def.jacks.filter((j) => inside(area, j)),
  };
}

/** SVG path data for a list of rects (used to cut them out of a dimming layer). */
export const rectsPath = (rects: ViewRect[]): string =>
  rects.map((r) => `M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}Z`).join('');

/** SVG path data for one area's rects. */
export const areaPath = (area: Area): string => rectsPath(area.rects);

// ── search ──────────────────────────────────────────────────────────────────
const TYPE: Record<string, string | undefined> = {
  knob: 'Knob',
  fader: 'Slider',
  button: 'Button',
  rocker: 'Switch',
  slide: 'Switch',
};

/** One row of the panel search: an area, a control or a jack, with its lower-cased search text. */
export interface SearchRow {
  kind: 'area' | 'control' | 'jack';
  id: string;
  name: string;
  type: string;
  where: string;
  color: string;
  help: string;
  unusual?: string;
  extra: string;
  _name: string;
  _extra: string;
  _help: string;
}

export function buildIndex(def: SynthDef): SearchRow[] {
  const rows: Omit<SearchRow, '_name' | '_extra' | '_help'>[] = [];
  (def.areas || []).forEach((a) =>
    rows.push({
      kind: 'area',
      id: a.id,
      name: a.label,
      type: 'Section',
      where: '',
      color: moduleOf(a.module).color,
      help: a.help,
      unusual: a.unusual,
      extra: `${a.keywords || ''} ${moduleOf(a.module).label}`,
    })
  );
  def.controls.forEach((c) => {
    if (c.find === false) return; // a copy of a control that is indexed already (the DeepMind's slot 2–4 effect parameters)
    const area = areaOf(def, c);
    const options = c.kind === 'enum' ? c.options : [];
    rows.push({
      kind: 'control',
      id: c.id,
      name: displayName(def, c),
      type: TYPE[c.type] || 'Switch',
      where: area ? area.label : '',
      color: moduleOf(c.module).color,
      help: c.help || '',
      unusual: c.unusual,
      extra: `${cleanLabel(c)} ${moduleOf(c.module).label} ${options.map((o) => o.label || '').join(' ')}`,
    });
  });
  def.jacks.forEach((j) => {
    const area = areaOf(def, j);
    rows.push({
      kind: 'jack',
      id: j.id,
      name: jackName(j),
      type: j.dir === 'out' ? 'Output jack' : 'Input jack',
      where: area ? area.label : '',
      color: moduleOf('patch').color,
      help: j.help || '',
      unusual: j.unusual,
      extra: `${j.label} jack socket patch ${j.dir === 'out' ? 'output' : 'input'}`,
    });
  });
  return rows.map((r) => ({
    ...r,
    _name: r.name.toLowerCase(),
    _extra: `${r.extra} ${r.where}`.toLowerCase(),
    _help: `${r.help} ${r.unusual || ''}`.toLowerCase(),
  }));
}

const KIND_ORDER: Record<SearchRow['kind'], number> = { area: 0, control: 1, jack: 2 };

/** Every word of the query must appear somewhere in a row; matches in the name count for most. */
export function searchIndex(rows: SearchRow[], query: string, limit = 8): SearchRow[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const hits: { r: SearchRow; score: number }[] = [];
  rows.forEach((r) => {
    let score = 0;
    for (const t of tokens) {
      if (r._name.startsWith(t)) score += 100;
      else if (new RegExp(`\\b${t.replace(/[^a-z0-9]/g, '\\$&')}`).test(r._name)) score += 60;
      else if (r._name.includes(t)) score += 40;
      else if (r._extra.includes(t)) score += 20;
      else if (r._help.includes(t)) score += 5;
      else return;
    }
    hits.push({ r, score });
  });
  hits.sort((a, b) => b.score - a.score || KIND_ORDER[a.r.kind] - KIND_ORDER[b.r.kind]);
  return hits.slice(0, limit).map((h) => h.r);
}
