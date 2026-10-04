import { isShown } from '@/lib/patch.js';

// Splits every area of a faceplate into one cell per control and jack, so the sound map can darken the part of the
// panel that belongs to a control: the control itself plus the silkscreen nearest to it. A cell is everything in the
// area that is closer to this control than to any other (a power diagram: bigger controls claim more room).

/** The points a control or jack claims room from: [x, y, weight]. Its printed label counts, so the label goes dark with it. */
function sitesOf(p, isJack) {
  const pts = [];
  let reach;
  if (isJack) {
    reach = p.r || 16;
    pts.push([p.x, p.y, reach]);
  } else if (p.type === 'select') {
    reach = Math.max(p.w || 30, p.h || 30) / 2;
    p.options.forEach((o) => pts.push([o.x, o.y, reach]));
  } else if (p.type === 'fader') {
    const half = (p.len || 200) / 2;
    reach = 16;
    for (let k = -2; k <= 2; k++) pts.push(p.orient === 'h' ? [p.x + (half * k) / 2, p.y, reach] : [p.x, p.y + (half * k) / 2, reach]);
    reach = half;
  } else {
    reach = p.type === 'knob' ? p.r * 1.3 : Math.max(p.w || 30, p.h || 30) / 2;
    pts.push([p.x, p.y, reach]);
  }
  const pos = p.labelPos || (isJack ? 'top' : null);
  if (p.label && pos && pos !== 'none') {
    const off = (p.type === 'fader' && (pos === 'left' || pos === 'right') ? 16 : reach) + 16;
    pts.push(pos === 'top' ? [p.x, p.y - off, 0] : pos === 'bottom' ? [p.x, p.y + off, 0] : pos === 'left' ? [p.x - off, p.y, 0] : [p.x + off, p.y, 0]);
  }
  return pts;
}

/** Keep the part of a convex polygon where a·x + b·y ≤ c. */
function clip(poly, a, b, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = a * p[0] + b * p[1] - c;
    const dq = a * q[0] + b * q[1] - c;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { const t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}

const PAD = 16;
/**
 * Area rects grown into the gutters round them (up to PAD, never past half way to a neighbouring rect), so a section
 * name printed ON the frame line belongs to its section instead of being cut in half by the wash over the gutter.
 */
function grown(def) {
  const all = (def.areas || []).flatMap((a) => a.rects);
  const out = new Map();
  for (const r of all) {
    const room = { l: Math.min(PAD, r.x), t: Math.min(PAD, r.y), r: Math.min(PAD, def.view.w - r.x - r.w), b: Math.min(PAD, def.view.h - r.y - r.h) };
    for (const o of all) {
      if (o === r) continue;
      const overX = o.x < r.x + r.w + PAD && o.x + o.w > r.x - PAD;
      const overY = o.y < r.y + r.h + PAD && o.y + o.h > r.y - PAD;
      const gaps = { l: r.x - (o.x + o.w), r: o.x - (r.x + r.w), t: r.y - (o.y + o.h), b: o.y - (r.y + r.h) };
      for (const side of ['l', 'r', 't', 'b']) {
        const facing = side === 'l' || side === 'r' ? overY : overX;
        if (facing && gaps[side] > -0.5) room[side] = Math.min(room[side], Math.max(0, gaps[side]) / 2);
      }
    }
    out.set(r, { x: r.x - room.l, y: r.y - room.t, w: r.w + room.l + room.r, h: r.h + room.t + room.b });
  }
  return out;
}

const n1 = (x) => Math.round(x * 10) / 10;
const inside = (a, p) => a.rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);

/**
 * `patched` = ids of the jacks that have a cable in them. In an area that has controls, an empty jack gets no cell of
 * its own: its patch of panel goes with the nearest control, so a lit section is not pitted with a dark spot round
 * every empty socket. A jack with a cable always has its own cell, and so does every jack of a jacks-only area
 * (a patch bay), or one cable would light the whole bay.
 * → { frame, cells: { [controlId | jackId]: path } }. `frame` is the whole faceplate with every area cut out of it;
 * each cell path is wound the same way as the faceplate, so `frame + cells…` in ONE path fills as a single shape with
 * no seams between neighbouring cells.
 */
export function panelCells(def, patched = [], values = null) {
  // Controls that are hidden by a panel mode (`show`) have no patch of panel of their own while they are hidden.
  const shown = (c) => !values || isShown(c, values);
  const hidden = values ? def.controls.filter((c) => !shown(c)).map((c) => c.id) : [];
  const key = `${[...patched].sort().join(' ')}|${hidden.join(' ')}`;
  if (!def._cells) def._cells = new Map();
  if (def._cells.has(key)) return def._cells.get(key);
  const { view } = def;
  const cells = {};
  const big = grown(def);
  let frame = `M0 0H${view.w}V${view.h}H0Z`;
  for (const area of def.areas || []) {
    const controls = def.controls.filter((c) => inside(area, c) && shown(c));
    const owners = [
      ...controls.map((c) => ({ id: c.id, pts: sitesOf(c, false) })),
      ...def.jacks.filter((j) => inside(area, j) && (!controls.length || patched.includes(j.id))).map((j) => ({ id: j.id, pts: sitesOf(j, true) })),
    ];
    if (!owners.length) continue; // nothing to light here: it stays part of the frame
    for (const small of area.rects) {
      const r = big.get(small);
      frame += `M${r.x} ${r.y}v${r.h}h${r.w}v${-r.h}Z`; // wound the other way: a hole
      for (const o of owners) {
        for (const s of o.pts) {
          let poly = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
          for (const other of owners) {
            if (other === o) continue;
            for (const t of other.pts) {
              // |x − s|² − ws² ≤ |x − t|² − wt²
              poly = clip(poly, 2 * (t[0] - s[0]), 2 * (t[1] - s[1]), t[0] * t[0] + t[1] * t[1] - s[0] * s[0] - s[1] * s[1] + s[2] * s[2] - t[2] * t[2]);
              if (poly.length < 3) break;
            }
            if (poly.length < 3) break;
          }
          if (poly.length >= 3) cells[o.id] = `${cells[o.id] || ''}M${poly.map((p) => `${n1(p[0])} ${n1(p[1])}`).join('L')}Z`;
        }
      }
    }
  }
  if (def._cells.size > 40) def._cells.clear();
  def._cells.set(key, { frame, cells });
  return def._cells.get(key);
}
