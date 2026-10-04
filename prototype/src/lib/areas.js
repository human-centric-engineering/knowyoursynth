// Areas: the named regions of a faceplate (one or more rects each) that the Areas view and the search explain.
import { cleanLabel, displayName } from '@/lib/patch.js';
import { jackName } from '@/lib/explain.js';
import { moduleOf } from '@/lib/modules.js';

const inside = (a, p) => a.rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);

export function areaMap(def) {
  if (!def._amap) def._amap = Object.fromEntries((def.areas || []).map((a) => [a.id, a]));
  return def._amap;
}

/** The area a control or jack sits in, or null. */
export const areaOf = (def, p) => (def.areas || []).find((a) => inside(a, p)) || null;

/** Everything that sits inside an area. */
export function areaMembers(def, area) {
  return { controls: def.controls.filter((c) => inside(area, c)), jacks: def.jacks.filter((j) => inside(area, j)) };
}

/** SVG path data for a list of rects (used to cut them out of a dimming layer). */
export const rectsPath = (rects) => rects.map((r) => `M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}Z`).join('');

/** SVG path data for one area's rects. */
export const areaPath = (area) => rectsPath(area.rects);

// ── search ──────────────────────────────────────────────────────────────────
const TYPE = { knob: 'Knob', fader: 'Slider', button: 'Button', rocker: 'Switch', slide: 'Switch' };

export function buildIndex(def) {
  const rows = [];
  (def.areas || []).forEach((a) => rows.push({
    kind: 'area', id: a.id, name: a.label, type: 'Section', where: '', color: moduleOf(a.module).color, help: a.help, unusual: a.unusual,
    extra: `${a.keywords || ''} ${moduleOf(a.module).label}`,
  }));
  def.controls.forEach((c) => {
    if (c.find === false) return; // a copy of a control that is indexed already (the DeepMind's slot 2–4 effect parameters)
    const area = areaOf(def, c);
    rows.push({
      kind: 'control', id: c.id, name: displayName(def, c), type: TYPE[c.type] || 'Switch', where: area ? area.label : '', color: moduleOf(c.module).color,
      help: c.help || '', unusual: c.unusual, extra: `${cleanLabel(c)} ${moduleOf(c.module).label} ${(c.options || []).map((o) => o.label || '').join(' ')}`,
    });
  });
  def.jacks.forEach((j) => {
    const area = areaOf(def, j);
    rows.push({
      kind: 'jack', id: j.id, name: jackName(j), type: j.dir === 'out' ? 'Output jack' : 'Input jack', where: area ? area.label : '', color: moduleOf('patch').color,
      help: j.help || '', unusual: j.unusual, extra: `${j.label} jack socket patch ${j.dir === 'out' ? 'output' : 'input'}`,
    });
  });
  rows.forEach((r) => { r._name = r.name.toLowerCase(); r._extra = `${r.extra} ${r.where}`.toLowerCase(); r._help = `${r.help} ${r.unusual || ''}`.toLowerCase(); });
  return rows;
}

const KIND_ORDER = { area: 0, control: 1, jack: 2 };

/** Every word of the query must appear somewhere in a row; matches in the name count for most. */
export function searchIndex(rows, query, limit = 8) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const hits = [];
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
