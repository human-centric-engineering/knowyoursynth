// Layers drawn over the faceplate: the Areas view, the search spotlight and the magnifier.
import { useEffect, useRef } from 'react';
import { findStore, focusStore, highlightStore, lensStore, mapStore, useStore } from '@/lib/store.js';
import { panelCells } from '@/lib/cells.js';
import { moduleOf } from '@/lib/modules.js';
import { areaMap, areaPath, rectsPath } from '@/lib/areas.js';
import { controlMap, formatValue, isShown, jackMap } from '@/lib/patch.js';
import { WHEEL } from '@/lib/soundmap.js';

const DIM = '#05060a';

/**
 * The union outline of a set of rects: stroke every one, then mask the insides away so only the outer edge is
 * left. `id` keeps the Areas view and the spotlight from sharing a mask when both are on screen.
 */
function AreaOutline({ rects, color, view, id = 'kysAreaEdge' }) {
  return (
    <g pointerEvents="none">
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width={view.w} height={view.h}>
        {rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="#fff" strokeWidth="8" strokeLinejoin="round" />)}
        {rects.map((r, i) => <rect key={`f${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill="#000" />)}
      </mask>
      <rect x="0" y="0" width={view.w} height={view.h} fill={color} mask={`url(#${id})`} />
    </g>
  );
}

/** Areas view: every region is tinted; the one under the pointer stays lit while the rest of the panel dims. */
export function AreaLayer({ def }) {
  const focusId = useStore(focusStore, (f) => (f && f.kind === 'area' ? f.id : null));
  const areas = def.areas || [];
  const active = areaMap(def)[focusId] || null;
  const { view } = def;
  const at = (e, a, extra) => {
    const r = e.clientX || e.clientY ? null : e.currentTarget.getBoundingClientRect();
    return { kind: 'area', id: a.id, x: r ? r.left + r.width / 2 : e.clientX, y: r ? r.bottom : e.clientY, tip: true, ...extra };
  };
  return (
    <g>
      {active && <path d={`M0 0H${view.w}V${view.h}H0Z${areaPath(active)}`} fillRule="evenodd" fill={DIM} opacity="0.62" pointerEvents="none" />}
      {areas.map((a) => {
        const color = moduleOf(a.module).color;
        const on = active === a;
        return (
          <g key={a.id}>
            {a.rects.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={a.rects.length > 1 ? 0 : 8} fill={color} fillOpacity={on ? 0.12 : active ? 0 : 0.2}
                className="kys-hit" style={{ cursor: 'help' }} tabIndex={i === 0 ? 0 : undefined} role={i === 0 ? 'button' : undefined} aria-label={i === 0 ? `${a.label}: ${a.help}` : undefined}
                onPointerEnter={(e) => focusStore.set(at(e, a, { tip: e.pointerType === 'mouse' }))}
                onPointerMove={(e) => { if (e.pointerType === 'mouse') focusStore.set(at(e, a)); }}
                onPointerLeave={() => focusStore.set((s) => (s && s.id === a.id && !s.sticky ? { ...s, tip: false } : s))}
                onClick={(e) => { e.stopPropagation(); focusStore.set(at(e, a, { sticky: true })); }}
                onFocus={(e) => focusStore.set(at(e, a))} />
            ))}
          </g>
        );
      })}
      {active && <AreaOutline rects={active.rects} color={moduleOf(active.module).color} view={view} />}
    </g>
  );
}

/**
 * Spotlight: dims the panel except for the thing the search — or the orientation tour — is pointing at, and
 * scrolls it into view. `{ kind: 'areas', ids }` lights several sections at once, which is what a tour stop
 * that covers all three of a 2600's oscillators needs.
 */
export function Locator({ def }) {
  const t = useStore(findStore);
  const ref = useRef(null);
  const key = t ? `${t.kind}:${t.kind === 'areas' ? t.ids.join(',') : t.id}` : '';
  useEffect(() => {
    if (key && ref.current && ref.current.scrollIntoView) ref.current.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [key]);
  if (!t) return null;
  const { view } = def;
  const frame = `M0 0H${view.w}V${view.h}H0Z`;
  if (t.kind === 'area' || t.kind === 'areas') {
    const am = areaMap(def);
    const list = (t.kind === 'areas' ? t.ids : [t.id]).map((id) => am[id]).filter(Boolean);
    if (!list.length) return null;
    const rects = list.flatMap((a) => a.rects);
    // Scroll the whole lit group into view, not just its first rect: two sections of one module can sit at
    // opposite ends of the faceplate (the Neutron's two patch bays).
    const x0 = Math.min(...rects.map((r) => r.x));
    const y0 = Math.min(...rects.map((r) => r.y));
    const box = { x: x0, y: y0, w: Math.max(...rects.map((r) => r.x + r.w)) - x0, h: Math.max(...rects.map((r) => r.y + r.h)) - y0 };
    return (
      <g pointerEvents="none">
        <path d={frame + rectsPath(rects)} fillRule="evenodd" fill={DIM} opacity="0.62" />
        <rect ref={ref} x={box.x} y={box.y} width={box.w} height={box.h} fill="none" />
        <g className="kys-pulse"><AreaOutline rects={rects} color="#f6a63a" view={view} id="kysFindEdge" /></g>
      </g>
    );
  }
  const p = t.kind === 'jack' ? jackMap(def)[t.id] : controlMap(def)[t.id];
  if (!p) return null;
  const r = Math.max(40, t.kind === 'jack' ? (p.r || 16) * 2.4 : p.type === 'knob' ? p.r * 1.95 : p.type === 'fader' ? (p.len || 200) * 0.62
    : p.type === 'menu' ? p.w * 0.58 : p.type === 'select' ? selectSpan(p) : Math.max(p.w, p.h) * 1.1);
  return (
    <g pointerEvents="none">
      <path d={`${frame}M${p.x - r} ${p.y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`} fillRule="evenodd" fill={DIM} opacity="0.62" />
      <circle ref={ref} className="kys-pulse" cx={p.x} cy={p.y} r={r} fill="none" stroke="#f6a63a" strokeWidth="5" />
    </g>
  );
}

/** Half the width of a row of buttons, from its centre to the far edge of its outermost button. */
const selectSpan = (p) => Math.max(...p.options.map((o) => Math.hypot(o.x - p.x, o.y - p.y))) + Math.max(p.w, p.h);

/** Magnifier: a second, enlarged drawing of the faceplate, clipped to a circle centred on the pointer. */
export function Lens({ view, zoom, source }) {
  const p = useStore(lensStore);
  if (!p) return null;
  const R = view.w * 0.085;
  return (
    <g pointerEvents="none">
      <clipPath id="kysLensClip"><circle cx={p.x} cy={p.y} r={R} /></clipPath>
      <circle cx={p.x + 4} cy={p.y + 9} r={R + 4} fill="#000" opacity="0.45" />
      <circle cx={p.x} cy={p.y} r={R} fill="#0a0b0e" />
      <g clipPath="url(#kysLensClip)">
        <use href={`#${source}`} transform={`translate(${p.x} ${p.y}) scale(${zoom}) translate(${-p.x} ${-p.y})`} />
      </g>
      <circle cx={p.x} cy={p.y} r={R} fill="none" stroke="#f4f1e8" strokeWidth="5" />
      <circle cx={p.x} cy={p.y} r={R + 3.5} fill="none" stroke="#000" strokeOpacity="0.6" strokeWidth="2" />
    </g>
  );
}

// ── sound map ───────────────────────────────────────────────────────────────
/** A jack is in the sound when a cable that is in the sound is plugged into it. */
const jackStates = (cables, state) => {
  const js = {};
  cables.forEach((cb) => { if (state[`${cb.from}>${cb.to}`] !== 'dead') { js[cb.from] = 'on'; js[cb.to] = 'on'; } });
  return js;
};

/**
 * "Dim unused parts". Everything that adds nothing to the sound as it stands gets a light wash; what does nothing at
 * all gets a second, heavy one on top. A control that is at zero or switched off (the way in to a dark section) keeps
 * only the light wash and is striped as well, because on a black faceplate two depths of darkness are hard to tell
 * apart. Whatever the lesson is pointing at is never dimmed.
 */
export function DimLayer({ def, cables, values, outline }) {
  const state = useStore(mapStore, (m) => m.state);
  const pointed = useStore(highlightStore);
  if (!state) return null;
  const { frame, cells } = panelCells(def, cables.flatMap((cb) => [cb.from, cb.to]), values);
  const cm = controlMap(def);
  const js = jackStates(cables, state);
  let unused = frame;
  let dead = frame;
  let zero = '';
  for (const id of Object.keys(cells)) {
    const st = pointed.includes(id) || (cm[id] && cm[id].ui) ? 'on' : state[id] || js[id] || 'dead';
    if (st !== 'on') unused += cells[id];
    if (st === 'dead') dead += cells[id]; else if (st === 'zero') zero += cells[id];
  }
  // On the paper worksheet, unused parts fade towards the paper instead of going dark, and the stripes are ink.
  const fill = outline ? '#eef0ec' : DIM;
  return (
    <g pointerEvents="none" className="kys-fade">
      <pattern id="kysStripes" patternUnits="userSpaceOnUse" width="13" height="13" patternTransform="rotate(45)">
        <rect x="0" y="0" width="4" height="13" fill={outline ? INK_STRIPE : '#ffffff'} />
      </pattern>
      <path d={unused} fill={fill} opacity={outline ? 0.55 : 0.4} />
      <path d={dead} fill={fill} opacity={outline ? 0.7 : 0.64} />
      {zero && <path d={zero} fill="url(#kysStripes)" opacity={outline ? 0.3 : 0.2} />}
    </g>
  );
}
const INK_STRIPE = '#1c2530';

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const WARM = [[255, 214, 92], [255, 56, 40]]; // yellow for a little → red for the most
const PALE = [[255, 196, 70], [255, 255, 255]]; // on a red faceplate a red glow cannot be seen: amber → white-hot
const isRed = (hex) => {
  const n = parseInt(String(hex || '').replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return r > 130 && g < r * 0.6 && b < r * 0.6;
};
/** Colour of a sensitivity 0..1 on this faceplate. The paper outline always takes the yellow-to-red ramp. */
export const heatColor = (h, def, outline) => {
  const [a, b] = !outline && isRed(def.theme.panel) ? PALE : WARM;
  return `rgb(${lerp(a[0], b[0], h)} ${lerp(a[1], b[1], h)} ${lerp(a[2], b[2], h)})`;
};

/** "Show sensitive knobs": a glow behind each knob or slider, bigger and redder the more a small move changes the sound. */
export function HeatLayer({ def, values, outline }) {
  const heat = useStore(mapStore, (m) => m.heat);
  if (!heat) return null;
  const hot = def.controls.filter((c) => heat[c.id] > 0 && isShown(c, values));
  return (
    <g pointerEvents="none" className="kys-fade">
      {hot.map((c, i) => {
        const h = heat[c.id];
        const col = heatColor(h, def, outline);
        const gid = `kysHeat${i}`;
        const peak = 0.12 + 0.8 * h;
        if (c.type === 'fader') {
          const v = c.orient !== 'h';
          const long = (c.len || 200) + 2 * (c.pad == null ? 12 : c.pad) + 24;
          const wide = 40 + 46 * h;
          return (
            <g key={c.id}>
              <linearGradient id={gid} x1="0" y1="0" x2={v ? 1 : 0} y2={v ? 0 : 1}>
                <stop offset="0" stopColor={col} stopOpacity="0" /><stop offset="0.5" stopColor={col} stopOpacity={peak} /><stop offset="1" stopColor={col} stopOpacity="0" />
              </linearGradient>
              <rect x={c.x - (v ? wide : long) / 2} y={c.y - (v ? long : wide) / 2} width={v ? wide : long} height={v ? long : wide} rx="12" fill={`url(#${gid})`} />
            </g>
          );
        }
        const body = c.type === 'knob' ? c.r * 1.25 : Math.max(c.w || 30, c.h || 30) * 0.6;
        const R = body * (1.3 + 0.6 * h);
        return (
          <g key={c.id}>
            <radialGradient id={gid}>
              <stop offset={(body / R) * 0.8} stopColor={col} stopOpacity={peak} /><stop offset="1" stopColor={col} stopOpacity="0" />
            </radialGradient>
            <circle cx={c.x} cy={c.y} r={R} fill={`url(#${gid})`} />
          </g>
        );
      })}
    </g>
  );
}

/** Numbers 1–3 on the three most sensitive knobs, matching the list under the panel. */
export function HeatRanks({ def, values, outline }) {
  const ranked = useStore(mapStore, (m) => m.ranked);
  const heat = useStore(mapStore, (m) => m.heat);
  if (!heat || !ranked.length) return null;
  const cm = controlMap(def);
  return (
    <g pointerEvents="none" className="kys-fade">
      {ranked.slice(0, 3).map((id, i) => {
        const c = cm[id];
        if (!c || !isShown(c, values)) return null;
        const off = c.type === 'knob' ? c.r * 1.05 : 20;
        const x = c.x + off;
        const y = c.type === 'fader' && c.orient !== 'h' ? c.y - (c.len || 200) / 2 - 6 : c.y - off;
        return (
          <g key={id}>
            <circle cx={x} cy={y} r="13" fill={heatColor(heat[id], def, outline)} stroke="#1b1204" strokeWidth="2" />
            <text x={x} y={y + 5.5} textAnchor="middle" fontSize="16" fontWeight="700" fontFamily="'JetBrains Mono', ui-monospace, monospace" fill="#1b1204">{i + 1}</text>
          </g>
        );
      })}
    </g>
  );
}

const doorReach = (p) => Math.max(34, p.type === 'knob' ? p.r * 1.7 : p.type === 'fader' ? (p.len || 200) * 0.6 : Math.max(p.w || 30, p.h || 30) * 0.95);

/** What to do to a door, as the two or three words printed next to its ring. */
function doorTag(c, door, values) {
  if (c.kind === 'bool') return door.v ? 'Switch on' : 'Switch off';
  if (c.kind === 'enum') return `Set to ${formatValue(c, door.v)}`;
  return `${c.type === 'fader' ? 'Move' : 'Turn'} ${door.v > values[c.id] ? 'up' : 'down'}`;
}

/**
 * "Why is it dark?" on the panel. While a dark control is the one being pointed at (it stays so after the pointer
 * leaves, like the inspector), it gets a plain ring, and every control that would bring it into the sound gets a
 * pulsing dashed ring, a line back to the dark control and a tag saying what to do. Where there are two ways in,
 * the second way's tags start with "or". The mod wheel is not on the faceplate: the keyboard strip rings it instead.
 */
export function DoorRings({ def, values }) {
  const id = useStore(focusStore, (f) => (f && f.kind === 'control' ? f.id : null));
  const dark = useStore(mapStore, (m) => !!id && !!m.state && m.state[id] === 'dead');
  const ways = useStore(mapStore, (m) => (id ? m.why[id] : null));
  const cm = controlMap(def);
  const from = dark && cm[id];
  if (!from) return null;
  const doors = [];
  (ways || []).forEach((combo, way) => combo.forEach((d) => {
    if (d.id !== WHEEL && cm[d.id] && !doors.some((x) => x.c.id === d.id)) doors.push({ c: cm[d.id], tag: `${way > 0 ? 'or ' : ''}${doorTag(cm[d.id], d, values)}` });
  }));
  const r0 = doorReach(from) * 0.85;
  return (
    <g pointerEvents="none">
      <circle cx={from.x} cy={from.y} r={r0} fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="7" />
      <circle cx={from.x} cy={from.y} r={r0} fill="none" stroke="#fff" strokeWidth="3" />
      {doors.map(({ c, tag }) => {
        const r = doorReach(c);
        const dist = Math.hypot(c.x - from.x, c.y - from.y) || 1;
        const [ux, uy] = [(c.x - from.x) / dist, (c.y - from.y) / dist];
        const w = tag.length * 9.6 + 22;
        const tx = Math.max(w / 2 + 6, Math.min(def.view.w - w / 2 - 6, c.x));
        const ty = c.y + r + 34 > def.view.h ? c.y - r - 22 : c.y + r + 22;
        return (
          <g key={c.id}>
            {dist > r + r0 + 8 && ['#000', '#fff'].map((col) => (
              <line key={col} x1={from.x + ux * r0} y1={from.y + uy * r0} x2={c.x - ux * r} y2={c.y - uy * r} stroke={col}
                strokeOpacity={col === '#000' ? 0.5 : 0.9} strokeWidth={col === '#000' ? 6 : 2.5} strokeDasharray={col === '#000' ? undefined : '4 8'} strokeLinecap="round" />
            ))}
            <g className="kys-pulse">
              <circle cx={c.x} cy={c.y} r={r} fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth="8" />
              <circle cx={c.x} cy={c.y} r={r} fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="14 9" />
            </g>
            <rect x={tx - w / 2} y={ty - 14} width={w} height="28" rx="14" fill="#fff" stroke="#000" strokeOpacity="0.6" strokeWidth="1.5" />
            <text x={tx} y={ty + 6} textAnchor="middle" fontSize="18" fontWeight="600" letterSpacing="0.4" fontFamily="'Barlow Semi Condensed', 'Arial Narrow', Arial, sans-serif" fill="#10131a">{tag.toUpperCase()}</text>
          </g>
        );
      })}
    </g>
  );
}
