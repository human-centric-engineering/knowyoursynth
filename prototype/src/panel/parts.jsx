// SVG parts for the synth faceplate: knobs, switches, jacks and silkscreen decor.
// Every part draws two ways: `hardware` (shaded, like the photo) and `outline` (ink on paper, like a patch sheet).
import { Fragment, memo, useRef, useState } from 'react';
import { focusStore, highlightStore, meterStore, useStore } from '@/lib/store.js';
import { moduleOf } from '@/lib/modules.js';
import { formatValue } from '@/lib/patch.js';

export const PAPER = '#f3f4ef';
export const INK = '#1c2530';
const ACCENT = '#f6a63a';

export const polar = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
};

export function optionIndex(c, v) {
  const i = c.options.findIndex((o) => o.v === v);
  return i < 0 ? 0 : i;
}

// Where a cont control sits along its travel, 0..1. `taper: 'log'` spreads a frequency or time range evenly by ratio.
const isLog = (c) => c.taper === 'log' && c.min > 0;
const toPos = (c, v) => (isLog(c) ? Math.log(v / c.min) / Math.log(c.max / c.min) : (v - c.min) / (c.max - c.min));
function fromPos(c, p) {
  const t = Math.max(0, Math.min(1, p));
  const v = isLog(c) ? c.min * Math.pow(c.max / c.min, t) : c.min + (c.max - c.min) * t;
  if (c.step) return Math.max(c.min, Math.min(c.max, Math.round(v / c.step) * c.step));
  return Math.round(v * 100) / 100;
}

export function valueAngle(c, v) {
  if (c.kind === 'enum') {
    const i = optionIndex(c, v);
    const o = c.options[i];
    if (o.a != null) return o.a;
    const n = c.options.length;
    return n === 1 ? 0 : -120 + (240 * i) / (n - 1);
  }
  return -150 + (300 * (v - c.min)) / (c.max - c.min);
}

const fontFor = (theme) =>
  theme.font === 'helv'
    ? { fontFamily: "'Archivo Narrow', 'Arial Narrow', Arial, sans-serif", fontWeight: 700 }
    : { fontFamily: "'Barlow Semi Condensed', 'Arial Narrow', Arial, sans-serif", fontWeight: theme.weight || 500, letterSpacing: '0.03em' };

export function PanelText({ x, y, text, size = 17, anchor = 'middle', fill, ctx, weight, spacing }) {
  const lines = String(text).split('\n');
  const f = fontFor(ctx.theme);
  return (
    <text x={x} y={y} fontSize={size} textAnchor={anchor} fill={fill || ctx.ink}
      style={{ ...f, ...(weight ? { fontWeight: weight } : null), ...(spacing ? { letterSpacing: spacing } : null), userSelect: 'none', pointerEvents: 'none' }}>
      {lines.map((ln, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : size * 1.08}>{ln}</tspan>
      ))}
    </text>
  );
}

export function wavePath(shape, s) {
  const h = s * 0.62;
  switch (shape) {
    case 'tri': return `M${-s} ${h} L0 ${-h} L${s} ${h}`;
    case 'saw': return `M${-s} ${h} L${s} ${-h} L${s} ${h}`;
    case 'rsaw': return `M${-s} ${h} L${-s} ${-h} L${s} ${h}`;
    case 'shark': return `M${-s} ${h} L${s * 0.45} ${-h} L${s} ${h}`;
    case 'sq': return `M${-s} ${h} L${-s} ${-h} L0 ${-h} L0 ${h} L${s} ${h}`;
    case 'pulse': return `M${-s} ${h} L${-s} ${-h} L${-s * 0.3} ${-h} L${-s * 0.3} ${h} L${s} ${h}`;
    case 'npulse': return `M${-s} ${h} L${-s} ${-h} L${-s * 0.62} ${-h} L${-s * 0.62} ${h} L${s} ${h}`;
    case 'sine': return `M${-s} 0 C${-s * 0.6} ${-h * 1.7} ${-s * 0.4} ${-h * 1.7} 0 0 S${s * 0.6} ${h * 1.7} ${s} 0`;
    case 'tmod': return `M${-s} ${h} L${-s} ${-h} L${-s * 0.45} ${-h} L${-s * 0.45} ${h * 0.1} L${s * 0.05} ${h * 0.1} L${s * 0.05} ${-h} L${s * 0.5} ${-h} L${s * 0.5} ${h} L${s} ${h}`;
    case 'adsr': return `M${-s} ${h} L${-s * 0.55} ${-h} L${-s * 0.2} ${-h * 0.05} L${s * 0.45} ${-h * 0.05} L${s} ${h}`;
    case 'ar': return `M${-s} ${h} C${-s * 0.75} ${-h * 0.6} ${-s * 0.6} ${-h} ${-s * 0.35} ${-h} L${s * 0.3} ${-h} C${s * 0.55} ${-h} ${s * 0.7} ${h * 0.6} ${s} ${h}`;
    case 'noise': return `M${-s} 0 L${-s * 0.75} ${-h} L${-s * 0.5} ${h * 0.6} L${-s * 0.3} ${-h * 0.4} L${-s * 0.1} ${h} L${s * 0.15} ${-h * 0.8} L${s * 0.35} ${h * 0.3} L${s * 0.6} ${-h} L${s * 0.8} ${h * 0.7} L${s} 0`;
    default: return '';
  }
}

const LED_COLORS = { red: '#ff3b30', amber: '#ffb020', blue: '#4f7dff', green: '#57e06a', white: '#fffbe8', yellow: '#ffd23a' };

function Led({ d, ctx, values }) {
  const meters = useStore(meterStore);
  let level = 0; // 0 = off, 1 = fully lit; a morph lamp sits anywhere between
  const w = d.litWhen;
  if (w === 'power') level = 1;
  else if (w === 'gate') level = meters.gate ? 1 : 0;
  else if (w === 'lfo') level = meters.lfo > 0 ? 1 : 0;
  else if (w === 'overload') level = meters.overload > 1.35 ? 1 : 0;
  // 'env1': brightness follows Envelope 1 over a dim glow (the VCS3 lamp: bright for attack and on, dim for decay and off)
  else if (w === 'env1') level = 0.22 + 0.78 * Math.min(1, Math.max(0, meters.env1 || 0));
  // 'pulser' (Easel): follows the pulser's falling ramp
  else if (w === 'pulser') level = Math.min(1, Math.max(0, meters.pulser || 0));
  // { seq: n } (Easel): the sequencer is on stage n (0-based)
  else if (w && typeof w === 'object' && w.seq != null) level = meters.seq === w.seq ? 1 : 0;
  else if (w && typeof w === 'object' && w.voice != null) level = (meters.voices || 0) & (1 << w.voice) ? 1 : 0;
  else if (w && typeof w === 'object' && w.osc != null) level = (meters.oscs || 0) & (1 << w.osc) ? 1 : 0;
  else if (w && typeof w === 'object') {
    const val = values[w.id];
    if (w.morph != null) {
      // one lamp of a row that a continuous knob fades across: full when the knob points at it, shared with its neighbour between
      const share = typeof val === 'number' ? Math.max(0, 1 - Math.abs(val - w.morph)) : 0;
      level = share < 0.02 ? 0 : Math.pow(share, 0.7); // the eye reads a half-driven LED as well over half as bright
    } else {
      level = val === w.eq || (Array.isArray(w.in) && w.in.includes(val)) || (w.near != null && typeof val === 'number' && Math.abs(val - w.eq) <= w.near) ? 1 : 0;
      if (w.not) level = 1 - level;
    }
  }
  const col = LED_COLORS[d.color] || LED_COLORS.red;
  const r = d.r || 6;
  if (ctx.outline) {
    return <g><circle cx={d.x} cy={d.y} r={r} fill={PAPER} stroke={INK} strokeWidth="1.5" />{level > 0 && <circle cx={d.x} cy={d.y} r={r - 0.75} fill={INK} opacity={level} />}</g>;
  }
  return (
    <g>
      {level > 0 && <circle cx={d.x} cy={d.y} r={r * 2.6} fill={col} opacity={0.28 * level} />}
      <circle cx={d.x} cy={d.y} r={r} fill="#3a1512" stroke="#0008" strokeWidth="1" />
      {level > 0 && <circle cx={d.x} cy={d.y} r={r - 0.5} fill={col} opacity={level} />}
      {level > 0 && <circle cx={d.x - r * 0.25} cy={d.y - r * 0.3} r={r * 0.35} fill="#fff" opacity={0.7 * level} />}
    </g>
  );
}

/**
 * A section name centred on (x, y). Themes with `tabs` print it the way the hardware does: a solid label plate with the
 * panel colour showing through the letters (`line` = outlined plate, ink letters). Everything else gets plain lettering,
 * with a gap knocked out of whatever line runs behind it.
 */
function Tab({ x, y, text, size, gapW, line, gap = true, ctx }) {
  if (ctx.theme.tabs && !ctx.outline) {
    const w = text.length * size * 0.6 + 16;
    const h = size * 1.5;
    return (
      <g>
        <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="4" fill={line ? ctx.panelFill : ctx.ink} stroke={ctx.ink} strokeWidth="1.6" />
        <PanelText x={x} y={y + size * 0.35} text={text} size={size} fill={line ? ctx.ink : ctx.panelFill} weight={600} ctx={ctx} />
      </g>
    );
  }
  const w = gapW || text.length * size * 0.62 + 22;
  return (
    <g>
      {gap && <rect x={x - w / 2} y={y - size * 0.6} width={w} height={size * 1.2} fill={ctx.panelFill} />}
      <PanelText x={x} y={y + size * 0.35} text={text} size={size} ctx={ctx} />
    </g>
  );
}

function Frame({ d, ctx }) {
  const size = d.labelSize || 22;
  const label = d.label && d.labelAt !== 'none' ? d.label : null;
  const at = d.labelAt || 'top';
  const onLine = at === 'top' || at === 'bottom';
  const cx = d.labelX != null ? d.labelX : d.x + d.w / 2;
  const ly = at === 'top' ? d.y : at === 'bottom' ? d.y + d.h : at === 'inside-top' ? d.y + size * 1.3 : d.y + d.h - size * 0.75;
  return (
    <g>
      <rect x={d.x} y={d.y} width={d.w} height={d.h} rx={d.r == null ? 14 : d.r} fill="none" stroke={ctx.ink} strokeWidth={d.sw || 2} strokeDasharray={d.dash} />
      {label && onLine && <Tab x={cx} y={ly} text={label} size={size} gapW={d.gapW} ctx={ctx} />}
      {label && !onLine && <PanelText x={cx} y={ly + size * 0.35} text={label} size={size} ctx={ctx} />}
    </g>
  );
}

function Logo({ d, ctx }) {
  const ink = ctx.ink;
  if (d.style === 'outline-d') {
    const s = d.size || 70;
    return (
      <g transform={`translate(${d.x} ${d.y})`} fill="none" stroke={ctx.outline ? INK : '#e9e9e6'} strokeWidth={s * 0.11} strokeLinejoin="round">
        <path d={`M${-s * 0.62} ${-s * 0.5} H${s * 0.25} Q${s * 0.62} ${-s * 0.5} ${s * 0.62} ${-s * 0.12} V${s * 0.12} Q${s * 0.62} ${s * 0.5} ${s * 0.25} ${s * 0.5} H${-s * 0.62} Z`} />
        <path d={`M${-s * 0.28} ${-s * 0.16} H${s * 0.22} V${s * 0.16} H${-s * 0.28} Z`} strokeWidth={s * 0.09} />
      </g>
    );
  }
  if (d.style === 'plate') {
    const s = d.size || 40;
    const w = s * 3.1;
    return (
      <g transform={`translate(${d.x} ${d.y})`}>
        <rect x={-w / 2} y={-s * 0.7} width={w} height={s * 1.4} rx={s * 0.16} fill={ctx.outline ? PAPER : '#dfe6ee'} stroke={ctx.outline ? INK : '#fff'} strokeWidth="2" />
        <text x="0" y={s * 0.36} fontSize={s} textAnchor="middle" fill={ctx.outline ? INK : '#111'} style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700, pointerEvents: 'none', userSelect: 'none' }}>{d.text || 'PRO-1'}</text>
      </g>
    );
  }
  if (d.style === 'neutron') {
    const s = d.size || 40;
    const ax = d.x + s * 4.35;
    const ay = d.y - s * 0.4;
    const grey = ctx.outline ? INK : '#e6bdb9';
    return (
      <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <text x={d.x} y={d.y} fontSize={s} textAnchor="middle" fill={ink} style={{ fontFamily: "'Michroma', 'Barlow Semi Condensed', sans-serif", letterSpacing: '0.04em' }}>{d.text || 'NEUTRON'}</text>
        <g fill="none" stroke={ink} strokeWidth={s * 0.06}>
          {[0, 60, 120].map((a) => <ellipse key={a} cx={ax} cy={ay} rx={s * 0.72} ry={s * 0.27} transform={`rotate(${a} ${ax} ${ay})`} />)}
        </g>
        <circle cx={ax} cy={ay} r={s * 0.14} fill={ink} />
        {d.sub && (
          <g>
            <rect x={d.x - s * 3.45} y={d.y + s * 0.26} width={s * 6.9} height={s * 0.5} rx={s * 0.12} fill="none" stroke={grey} strokeWidth="1.2" opacity="0.8" />
            <text x={d.x} y={d.y + s * 0.63} fontSize={s * 0.3} textAnchor="middle" fill={grey} style={{ fontFamily: "'Michroma', 'Barlow Semi Condensed', sans-serif", letterSpacing: '0.2em' }}>{d.sub}</text>
          </g>
        )}
      </g>
    );
  }
  const s = d.size || 18;
  return (
    <g transform={`translate(${d.x} ${d.y})`} fill="none" stroke={ink} strokeWidth="2">
      <path d={`M0 ${-s * 2.6} L${s * 1.25} ${-s * 0.75} H${-s * 1.25} Z`} strokeLinejoin="round" />
      <path d={`M${-s * 0.35} ${-s * 1.15} a${s * 0.35} ${s * 0.35} 0 1 1 ${s * 0.7} 0 v${s * 0.3}`} strokeLinecap="round" />
      <text x="0" y={s * 0.35} fontSize={s} textAnchor="middle" fill={ink} stroke="none" style={{ fontFamily: "'Instrument Sans', Arial, sans-serif", fontWeight: 500, pointerEvents: 'none', userSelect: 'none' }}>{d.text || 'behringer'}</text>
    </g>
  );
}

function DecorItem({ d, ctx }) {
  const ink = ctx.ink;
  if (d.hw && ctx.outline) return null; // faceplate artwork that only the hardware view prints
  switch (d.t) {
    case 'frame': return <Frame d={d} ctx={ctx} />;
    case 'tab': return <Tab x={d.x} y={d.y} text={d.text} size={d.size || 14} line={d.line} gap={d.gap !== false} ctx={ctx} />;
    case 'arc': {
      const [x1, y1] = polar(d.x, d.y, d.r, d.a0);
      const [x2, y2] = polar(d.x, d.y, d.r, d.a1);
      return <path d={`M${x1} ${y1} A${d.r} ${d.r} 0 ${d.a1 - d.a0 > 180 ? 1 : 0} 1 ${x2} ${y2}`} fill="none" stroke={ctx.outline ? ink : d.stroke || ink} strokeWidth={d.w || 2} strokeLinecap={d.cap || 'round'} opacity={d.opacity == null ? 1 : d.opacity} />;
    }
    case 'text': {
      const t = <PanelText x={d.x} y={d.y} text={d.text} size={d.size} anchor={d.anchor} weight={d.weight} spacing={d.spacing} fill={ctx.outline ? INK : d.fill} ctx={ctx} />;
      // `rotate` (degrees, about x, y): the VCS3 matrix prints its column names standing up
      return d.rotate ? <g transform={`rotate(${d.rotate} ${d.x} ${d.y})`}>{t}</g> : t;
    }
    // A coloured `stroke` is faceplate print colour: the outline view draws it in ink like everything else.
    case 'line': return <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={ctx.outline ? ink : d.stroke || ink} strokeWidth={d.w || 2} opacity={d.opacity == null ? 1 : d.opacity} />;
    // `shift` [dx, dy]: a path moved as a whole (the modular layout moves paths this way rather than rewriting them).
    case 'path': return <path transform={d.shift ? `translate(${d.shift[0]} ${d.shift[1]})` : undefined} d={d.d} stroke={ctx.outline && d.stroke && d.stroke !== 'none' ? ink : d.stroke || ink} strokeWidth={d.w == null ? 2 : d.w} fill={ctx.outline ? 'none' : d.fill || 'none'} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={d.dash} opacity={d.opacity == null ? 1 : d.opacity} />;
    case 'rect':
      return ctx.outline
        ? <rect x={d.x} y={d.y} width={d.w} height={d.h} rx={d.r || 0} fill="none" stroke={INK} strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
        : <rect x={d.x} y={d.y} width={d.w} height={d.h} rx={d.r || 0} fill={d.fill || 'none'} stroke={d.stroke || 'none'} strokeWidth={d.sw || 0} />;
    case 'circle':
      return <circle cx={d.x} cy={d.y} r={d.r} fill={ctx.outline ? 'none' : d.fill || 'none'} stroke={ctx.outline ? ink : d.stroke || ink} strokeWidth={d.sw == null ? 2 : d.sw} />;
    case 'wave':
      return <path transform={`translate(${d.x} ${d.y})`} d={wavePath(d.shape, d.size || 12)} fill="none" stroke={ctx.outline ? ink : d.stroke || ink} strokeWidth={d.w || Math.max(1.6, (d.size || 12) * 0.16)} strokeLinejoin="round" strokeLinecap="round" />;
    case 'arrow': {
      const s = d.size || 7;
      const up = d.dir === 'up';
      return <path d={`M${d.x - s} ${d.y + (up ? s * 0.6 : -s * 0.6)} L${d.x + s} ${d.y + (up ? s * 0.6 : -s * 0.6)} L${d.x} ${d.y + (up ? -s * 0.8 : s * 0.8)} Z`} fill={ink} />;
    }
    case 'screw': {
      const r = d.r || 8;
      return ctx.outline ? (
        <g stroke={INK} strokeWidth="1.3" fill="none"><circle cx={d.x} cy={d.y} r={r} /><path d={`M${d.x - r * 0.6} ${d.y} H${d.x + r * 0.6} M${d.x} ${d.y - r * 0.6} V${d.y + r * 0.6}`} /></g>
      ) : (
        <g><circle cx={d.x} cy={d.y} r={r} fill="url(#kysScrew)" stroke="#000a" strokeWidth="1" /><path d={`M${d.x - r * 0.55} ${d.y - r * 0.3} L${d.x + r * 0.55} ${d.y + r * 0.3} M${d.x - r * 0.3} ${d.y + r * 0.55} L${d.x + r * 0.3} ${d.y - r * 0.55}`} stroke="#0009" strokeWidth="1.6" /></g>
      );
    }
    case 'din': {
      const r = d.r || 42;
      const pins = [-90, -45, 0, 45, 90].map((a) => polar(d.x, d.y, r * 0.5, a + 180));
      return ctx.outline ? (
        <g stroke={INK} strokeWidth="1.6" fill="none"><circle cx={d.x} cy={d.y} r={r} /><circle cx={d.x} cy={d.y} r={r * 0.74} />{pins.map(([px, py], i) => <circle key={i} cx={px} cy={py} r={r * 0.07} fill={INK} />)}</g>
      ) : (
        <g>
          <circle cx={d.x} cy={d.y} r={r} fill="url(#kysNut)" stroke="#0009" strokeWidth="1.5" />
          <circle cx={d.x} cy={d.y} r={r * 0.78} fill="#0c0c0d" stroke="#000" strokeWidth="2" />
          <rect x={d.x - r * 0.1} y={d.y - r * 0.78} width={r * 0.2} height={r * 0.16} fill="#2a2a2c" />
          {pins.map(([px, py], i) => <circle key={i} cx={px} cy={py} r={r * 0.075} fill="#b9b9b3" />)}
        </g>
      );
    }
    case 'usb': {
      const w = d.w || 60, h = d.h || 52;
      return ctx.outline ? (
        <g stroke={INK} strokeWidth="1.6" fill="none"><rect x={d.x - w / 2} y={d.y - h / 2} width={w} height={h} rx="4" /><rect x={d.x - w * 0.28} y={d.y - h * 0.26} width={w * 0.56} height={h * 0.52} /></g>
      ) : (
        <g>
          <rect x={d.x - w / 2} y={d.y - h / 2} width={w} height={h} rx="4" fill="url(#kysNut)" stroke="#0009" strokeWidth="1.5" />
          <rect x={d.x - w * 0.34} y={d.y - h * 0.34} width={w * 0.68} height={h * 0.68} rx="2" fill="#0b0b0c" />
          <rect x={d.x - w * 0.2} y={d.y - h * 0.08} width={w * 0.4} height={h * 0.2} fill="#d8d8d2" />
        </g>
      );
    }
    case 'logo': return <Logo d={d} ctx={ctx} />;
    default: return null;
  }
}

/**
 * The case behind a modular layout (`def.layout`, from `modularDef`): rails along each row, one faceplate per module with
 * its screws and the series name, and blank panels where a row is short. Drawn in place of the long faceplate.
 */
export function ModularCase({ layout, view, ctx }) {
  const { plates, blanks, brand } = layout;
  const rows = [...new Set(plates.map((p) => `${p.y}:${p.h}`))].map((k) => k.split(':').map(Number));
  const screws = (p) => {
    const xs = p.w > 150 ? [p.x + 14, p.x + p.w - 14] : [p.x + 14];
    return [p.y + 13, p.y + p.h - 13].flatMap((y, i) => (i ? xs.slice().reverse() : xs).map((x) => ({ t: 'screw', x, y, r: 6 })));
  };
  if (ctx.outline) {
    return (
      <g>
        <rect x="0" y="0" width={view.w} height={view.h} rx="10" fill={PAPER} />
        <rect x="0" y="0" width={view.w} height={view.h} rx="10" fill="url(#kysGrid)" />
        {plates.map((p, i) => <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx="4" fill={PAPER} stroke={INK} strokeWidth="2.5" />)}
        {blanks.map((p, i) => <rect key={`b${i}`} x={p.x} y={p.y} width={p.w} height={p.h} rx="4" fill="none" stroke={INK} strokeWidth="1.5" strokeDasharray="7 6" />)}
        {plates.flatMap(screws).map((d, i) => <DecorItem key={`s${i}`} d={d} ctx={ctx} />)}
      </g>
    );
  }
  const { theme } = ctx;
  return (
    <g>
      <rect x="0" y="0" width={view.w} height={view.h} rx="10" fill="#0b0b0c" />
      {rows.map(([y, h]) => [y + 4, y + h - 16].map((ry) => (
        <g key={`${y}-${ry}`}>
          <rect x="8" y={ry} width={view.w - 16} height="12" fill="url(#kysMetal)" opacity="0.55" />
          <rect x="8" y={ry} width={view.w - 16} height="12" fill="url(#kysPatFine)" opacity="0.25" />
        </g>
      )))}
      <linearGradient id="kysFace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={theme.panel} /><stop offset="1" stopColor={theme.panel2 || theme.panel} /></linearGradient>
      {[...plates, ...blanks].map((p, i) => (
        <g key={i}>
          <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="3" fill="url(#kysFace)" stroke="#000" strokeWidth="1.5" />
          <rect x={p.x + 1} y={p.y + 1} width={p.w - 2} height="2" fill="#fff" opacity="0.12" />
        </g>
      ))}
      {blanks.map((p, i) => (
        <g key={`b${i}`}>
          {Array.from({ length: Math.max(0, Math.floor((p.h - 70) / 16)) }, (_, k) => (
            <rect key={k} x={p.x + 30} y={p.y + 34 + k * 16} width={Math.max(0, p.w - 60)} height="6" rx="3" fill="#000" opacity="0.55" />
          ))}
          <PanelText x={p.x + p.w / 2} y={p.y + p.h - 12} text={brand} size={13} weight={700} spacing="0.3em" fill={theme.ink} ctx={ctx} />
        </g>
      ))}
      {plates.flatMap(screws).map((d, i) => <DecorItem key={`s${i}`} d={d} ctx={ctx} />)}
      {plates.map((p, i) => <PanelText key={`n${i}`} x={p.x + 28} y={p.y + p.h - 10} text={brand} size={9} anchor="start" spacing="0.2em" fill={theme.ink} ctx={ctx} />)}
    </g>
  );
}

export const StaticDecor = memo(function StaticDecor({ decor, ctx }) {
  return <g>{decor.filter((d) => d.t !== 'led' && d.t !== 'lcd').map((d, i) => <DecorItem key={i} d={d} ctx={ctx} />)}</g>;
});

/** Decor that follows the panel's values: lamps, and the display screen. */
export function Leds({ decor, ctx, values }) {
  return <g>{decor.filter((d) => d.t === 'led' || d.t === 'lcd').map((d, i) => (d.t === 'lcd' ? <Screen key={i} d={d} ctx={ctx} values={values} /> : <Led key={i} d={d} ctx={ctx} values={values} />))}</g>;
}

// ── Display screen ──────────────────────────────────────────────────────────
// A backlit LCD. It prints the title of the page chosen by the `page` control, and a note for pages that have no menu
// rows here; the rows themselves are 'menu' controls placed over it, shown per page with `show`.
const LCD_BG = '#dfe6e3';
const LCD_FG = '#172024';
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

function Screen({ d, ctx, values }) {
  const page = values[d.page];
  const bg = ctx.outline ? PAPER : LCD_BG;
  const fg = ctx.outline ? INK : LCD_FG;
  const title = (d.titles && d.titles[page]) || '';
  const note = d.notes && d.notes[page];
  const th = d.titleH || 30;
  return (
    <g pointerEvents="none">
      {!ctx.outline && <rect x={d.x - 8} y={d.y - 8} width={d.w + 16} height={d.h + 16} rx="6" fill="#050506" stroke="#2c2d30" strokeWidth="2" />}
      <rect x={d.x} y={d.y} width={d.w} height={d.h} rx="3" fill={bg} stroke={ctx.outline ? INK : 'none'} strokeWidth="2" />
      {!ctx.outline && <rect x={d.x} y={d.y} width={d.w} height={d.h} rx="3" fill="url(#kysLcdGlow)" />}
      <rect x={d.x + 4} y={d.y + 4} width={d.w - 8} height={th} rx="2" fill={fg} />
      <text x={d.x + 12} y={d.y + 4 + th * 0.7} fontSize={th * 0.6} fill={bg} style={{ fontFamily: MONO, fontWeight: 700, userSelect: 'none' }}>{title}</text>
      {note && String(note).split('\n').map((ln, i) => (
        <text key={i} x={d.x + 12} y={d.y + th + 34 + i * 24} fontSize="17" fill={fg} style={{ fontFamily: MONO, userSelect: 'none' }}>{ln}</text>
      ))}
    </g>
  );
}

/** One row of a menu page on the display: the parameter name, and its value in an inverted box. Click or drag to change. */
export const MenuRow = memo(function MenuRow({ c, value, target, ctx, onChange }) {
  const hover = useHover('control', c.id);
  const drag = useKnobDrag(c, value, onChange);
  const hl = useStore(highlightStore, (ids) => ids.includes(c.id));
  const fg = ctx.outline ? INK : LCD_FG;
  const bg = ctx.outline ? PAPER : LCD_BG;
  const size = c.size || 16;
  let txt;
  if (c.kind === 'cont') txt = c.fmt ? c.fmt(value) : String(Math.round(value * 10) / 10);
  else txt = formatValue(c, value);
  const vw = c.vw || 118;
  const left = c.x - c.w / 2;
  const right = c.x + c.w / 2;
  const off = target != null && (c.kind === 'cont' ? Math.abs(target - value) > (c.max - c.min) * 0.015 : target !== value);
  return (
    <g>
      {hl && <rect className="kys-pulse" x={left - 3} y={c.y - c.h / 2 - 2} width={c.w + 6} height={c.h + 4} rx="4" fill="none" stroke={moduleOf(c.module).color} strokeWidth="4" pointerEvents="none" />}
      <text x={left + 8} y={c.y + size * 0.36} fontSize={size} fill={fg} style={{ fontFamily: MONO, userSelect: 'none', pointerEvents: 'none' }}>{c.label}</text>
      <rect x={right - vw - 4} y={c.y - c.h / 2 + 2} width={vw} height={c.h - 4} rx="2" fill={fg} pointerEvents="none" />
      <text x={right - 10} y={c.y + size * 0.36} fontSize={size} textAnchor="end" fill={bg} style={{ fontFamily: MONO, fontWeight: 700, userSelect: 'none', pointerEvents: 'none' }}>{txt}</text>
      {off && <path transform={`translate(${right - vw - 12} ${c.y})`} d="M5 0 L-6 -6 L-6 6 Z" fill={ACCENT} stroke="#0008" strokeWidth="1" pointerEvents="none" />}
      <rect x={left} y={c.y - c.h / 2} width={c.w} height={c.h} fill="transparent" tabIndex={0} role="slider" aria-label={c.label}
        aria-valuetext={txt} className="kys-hit" style={{ cursor: c.kind === 'enum' ? 'pointer' : 'ns-resize', touchAction: 'none' }}
        {...hover} {...drag}
        onPointerMove={(e) => { drag.onPointerMove(e); hover.onPointerMove(e); }} />
    </g>
  );
});

// ── Backlit buttons ─────────────────────────────────────────────────────────
// The DeepMind's square buttons light from inside. The colour says what kind of button it is; lit means on or chosen.
const LAMP = { white: ['#f3f6f3', '#4b4e50'], blue: ['#8fe1ef', '#2f4d53'], amber: ['#f6c870', '#5a4526'], red: ['#ff4a36', '#4a1512'] };

function LampButton({ x, y, w, h, lamp, lit, ctx }) {
  if (ctx.outline) {
    return (
      <g pointerEvents="none">
        <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="5" fill={PAPER} stroke={INK} strokeWidth="2" />
        {lit && <rect x={x - w / 2 + 4} y={y - h / 2 + 4} width={w - 8} height={h - 8} rx="3" fill={INK} opacity="0.8" />}
      </g>
    );
  }
  const [on, off] = LAMP[lamp] || LAMP.white;
  return (
    <g pointerEvents="none">
      {lit && <rect x={x - w / 2 - 9} y={y - h / 2 - 9} width={w + 18} height={h + 18} rx="12" fill={on} opacity="0.22" />}
      <rect x={x - w / 2 + 2} y={y - h / 2 + 4} width={w} height={h} rx="6" fill="#000" opacity="0.5" />
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="6" fill={lit ? on : off} stroke="#000" strokeOpacity="0.55" strokeWidth="1.5" />
      <rect x={x - w / 2 + 3} y={y - h / 2 + 2} width={w - 6} height={h * 0.35} rx="4" fill="#fff" opacity={lit ? 0.35 : 0.08} />
    </g>
  );
}

/**
 * A square cap with a white printed rim, its name printed on the cap and a small lamp in the top-left corner that lights
 * when the button is on (PRO-800 programmer buttons). `caption` is the text on the cap; `faceColor: 'red'` for a red cap.
 */
export function RingButton({ c, lit, ctx }) {
  const { x, y, w, h } = c;
  const size = c.captionSize || 11;
  const lines = String(c.caption || '').split('\n');
  const ty = y - ((lines.length - 1) * size * 1.08) / 2 + size * 0.36;
  if (ctx.outline) {
    return (
      <g pointerEvents="none">
        <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="7" fill={PAPER} stroke={INK} strokeWidth="2" />
        <circle cx={x - w / 2 + 8} cy={y - h / 2 + 8} r="3.5" fill={lit ? INK : PAPER} stroke={INK} strokeWidth="1.2" />
        {c.caption && <PanelText x={x} y={ty} text={c.caption} size={size} weight={700} fill={INK} ctx={ctx} />}
      </g>
    );
  }
  const red = c.faceColor === 'red';
  return (
    <g pointerEvents="none">
      <rect x={x - w / 2 + 2} y={y - h / 2 + 4} width={w} height={h} rx="8" fill="#000" opacity="0.5" />
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="8" fill={red ? '#e3252b' : '#161618'} stroke={red ? '#ff6b6b' : ctx.ink} strokeWidth="2.4" />
      <rect x={x - w / 2 + 4} y={y - h / 2 + 3} width={w - 8} height={h * 0.3} rx="5" fill="#fff" opacity={red ? 0.16 : 0.05} />
      {lit && <circle cx={x - w / 2 + 8} cy={y - h / 2 + 8} r="7" fill={LED_COLORS.red} opacity="0.35" />}
      <circle cx={x - w / 2 + 8} cy={y - h / 2 + 8} r="3.6" fill={lit ? '#ff6f86' : '#4a3a3d'} stroke="#000" strokeOpacity="0.5" strokeWidth="1" />
      {c.caption && <PanelText x={x} y={ty} text={c.caption} size={size} weight={700} fill="#f4f4f2" ctx={ctx} />}
    </g>
  );
}

/**
 * A row of backlit buttons that choose one of several options (radio buttons): one control, one button per option at
 * the option's own `x, y`. Used for panel modes such as the DeepMind's envelope select and its EDIT buttons.
 */
export const Select = memo(function Select({ c, value, target, ctx, onChange }) {
  const hover = useHover('control', c.id);
  const hl = useStore(highlightStore, (ids) => ids.includes(c.id));
  const col = moduleOf(c.module).color;
  return (
    <g>
      {c.options.map((o) => {
        // `hide`: a value with no button of its own (the Jupiter-8's arpeggio OFF: press the lit MODE button again)
        if (o.hide) return null;
        const lit = o.v === value;
        const cap = o.capColor || c.capColor;
        return (
          <g key={String(o.v)}>
            {o.text && <PanelText x={o.x} y={o.y - c.h / 2 - 10} text={o.text} size={c.labelSize || 13} ctx={ctx} />}
            {hl && <rect className="kys-pulse" x={o.x - c.w / 2 - 8} y={o.y - c.h / 2 - 8} width={c.w + 16} height={c.h + 16} rx="9" fill="none" stroke={col} strokeWidth="4" pointerEvents="none" />}
            {cap ? <CapButton x={o.x} y={o.y} w={c.w} h={c.h} color={cap} lit={lit} ctx={ctx} /> : <LampButton x={o.x} y={o.y} w={c.w} h={c.h} lamp={o.lamp || c.lamp} lit={lit} ctx={ctx} />}
            {target === o.v && target !== value && <circle cx={o.x + c.w / 2 + 5} cy={o.y - c.h / 2 - 5} r="6" fill={ACCENT} stroke="#0008" pointerEvents="none" />}
            <rect x={o.x - c.w / 2 - 5} y={o.y - c.h / 2 - 5} width={c.w + 10} height={c.h + 10} fill="transparent" tabIndex={0} role="radio" aria-checked={lit}
              aria-label={`${cleanName(c)}: ${o.label || o.v}`} className="kys-hit" style={{ cursor: 'pointer' }} {...hover}
              onClick={(e) => { focusStore.set({ kind: 'control', id: c.id, x: e.clientX, y: e.clientY, tip: false }); onChange(c.id, pick(c, o, value)); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(c.id, pick(c, o, value)); } }} />
          </g>
        );
      })}
    </g>
  );
});
const cleanName = (c) => (c.label || c.id).replace(/\n/g, ' ');
/** `offValue`: pressing the lit button again sets that value (the Jupiter-8's arpeggio MODE buttons switch it off). */
const pick = (c, o, value) => (c.offValue != null && o.v === value ? c.offValue : o.v);

/** A coloured square cap with a lamp in its top edge that lights when chosen (the Jupiters' select buttons). */
function CapButton({ x, y, w, h, color, lit, ctx }) {
  if (ctx.outline) {
    return (
      <g pointerEvents="none">
        <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="3" fill={PAPER} stroke={INK} strokeWidth="2" />
        <circle cx={x} cy={y - h / 2 + 6} r="3.2" fill={lit ? INK : PAPER} stroke={INK} strokeWidth="1.2" />
      </g>
    );
  }
  return (
    <g pointerEvents="none">
      <rect x={x - w / 2 + 2} y={y - h / 2 + 3} width={w} height={h} rx="3" fill="#0007" />
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="3" fill={color} stroke="#0008" strokeWidth="1.2" />
      <rect x={x - w / 2 + 3} y={y - h / 2 + 2} width={w - 6} height={h * 0.28} rx="2" fill="#fff" opacity="0.22" />
      {lit && <circle cx={x} cy={y - h / 2 + 6} r="7" fill={LED_COLORS.red} opacity="0.35" />}
      <circle cx={x} cy={y - h / 2 + 6} r="3.4" fill={lit ? '#ff4a3a' : '#5a2a26'} stroke="#000" strokeOpacity="0.5" strokeWidth="1" />
    </g>
  );
}

// ── interaction helpers ─────────────────────────────────────────────────────
const tipFrom = (e, kind, id) => ({ kind, id, x: e.clientX, y: e.clientY, tip: e.pointerType === 'mouse' });

function useHover(kind, id) {
  return {
    onPointerEnter: (e) => focusStore.set(tipFrom(e, kind, id)),
    // A cable that has just been plugged in here keeps its card up until the pointer leaves the jack.
    onPointerMove: (e) => { if (e.pointerType === 'mouse' && !e.buttons) focusStore.set((s) => (s && s.kind === 'cable' && s.at === id && s.tip ? s : tipFrom(e, kind, id))); },
    onPointerLeave: () => focusStore.set((s) => (s && (s.id === id || s.at === id) ? { ...s, tip: false } : s)),
  };
}

function useKnobDrag(c, value, onChange) {
  const drag = useRef(null);
  const isEnum = c.kind === 'enum';
  return {
    onPointerDown: (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, v: isEnum ? optionIndex(c, value) : toPos(c, value), moved: false };
      focusStore.set({ kind: 'control', id: c.id, x: e.clientX, y: e.clientY, tip: false });
    },
    onPointerMove: (e) => {
      const d = drag.current;
      if (!d) return;
      const delta = d.y - e.clientY + (e.clientX - d.x);
      if (Math.abs(delta) > 3) d.moved = true;
      if (isEnum) {
        const n = c.options.length;
        const i = Math.max(0, Math.min(n - 1, d.v + Math.round(delta / 24)));
        if (c.options[i].v !== value) onChange(c.id, c.options[i].v);
      } else {
        onChange(c.id, fromPos(c, d.v + delta / (e.shiftKey ? 900 : 190)));
      }
    },
    onPointerUp: (e) => {
      const d = drag.current;
      drag.current = null;
      if (d && !d.moved && isEnum) {
        const i = (optionIndex(c, value) + 1) % c.options.length;
        onChange(c.id, c.options[i].v);
      }
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    },
    onDoubleClick: () => onChange(c.id, null),
    onKeyDown: (e) => {
      const up = e.key === 'ArrowUp' || e.key === 'ArrowRight';
      const down = e.key === 'ArrowDown' || e.key === 'ArrowLeft';
      if (!up && !down) return;
      e.preventDefault();
      if (isEnum) {
        const i = Math.max(0, Math.min(c.options.length - 1, optionIndex(c, value) + (up ? 1 : -1)));
        onChange(c.id, c.options[i].v);
      } else {
        const step = c.step && !e.shiftKey ? Math.max(c.step / (c.max - c.min), 1 / 50) : 1 / (e.shiftKey ? 200 : 50);
        onChange(c.id, fromPos(c, toPos(c, value) + (up ? step : -step)));
      }
    },
  };
}

function Highlight({ c, r }) {
  const on = useStore(highlightStore, (ids) => ids.includes(c.id));
  if (!on) return null;
  const col = moduleOf(c.module).color;
  return (
    <g pointerEvents="none">
      <circle cx={c.x} cy={c.y} r={r} fill={col} opacity="0.16" />
      <circle className="kys-pulse" cx={c.x} cy={c.y} r={r} fill="none" stroke={col} strokeWidth="4" />
    </g>
  );
}

function ControlLabel({ c, ctx, extentTop, extentBottom }) {
  if (!c.label || c.labelPos === 'none' || !c.labelPos) return null;
  const size = c.labelSize || (c.type === 'knob' ? 17 : 12);
  const lines = c.label.split('\n').length;
  const gap = c.labelGap || 0;
  if (c.labelPos === 'top') return <PanelText x={c.x} y={c.y - extentTop - gap - (lines - 1) * size * 1.08} text={c.label} size={size} ctx={ctx} />;
  if (c.labelPos === 'bottom') return <PanelText x={c.x} y={c.y + extentBottom + gap + size} text={c.label} size={size} ctx={ctx} />;
  const sideY = c.y + size * 0.35 - (lines - 1) * size * 0.54; // keep a stacked side label centred on the control
  if (c.labelPos === 'left') return <PanelText x={c.x - extentBottom - gap} y={sideY} text={c.label} size={size} anchor="end" ctx={ctx} />;
  return <PanelText x={c.x + extentBottom + gap} y={sideY} text={c.label} size={size} anchor="start" ctx={ctx} />;
}

// ── Knob ────────────────────────────────────────────────────────────────────
const KNOB_GEOM = {
  'd-silver': { body: 1.24, tick: 1.32, num: 1.7 },
  'd-chicken': { body: 1.36, tick: 1.42, num: 1.84 },
  pro1: { body: 1.0, tick: 1.18, num: 1.58 },
  neutron: { body: 1.18, tick: 1.32, num: 1.75 },
  'neutron-big': { body: 1.15, tick: 1.3, num: 1.7 },
  obxa: { body: 1.0, tick: 1.12, num: 1.5 },
  kobol: { body: 1.0, tick: 1.3, num: 1.68 },
  cat: { body: 1.1, tick: 1.34, num: 1.72 },
  wasp: { body: 1.02, tick: 1.36, num: 1.66 },
  vcs3: { body: 1.06, tick: 1.3, num: 1.62 },
  'vcs3-dial': { body: 1.3, tick: 1.4, num: 1.7 },
};

function KnobScale({ c, ctx, g }) {
  const out = [];
  const sc = c.scale;
  const size = (sc && sc.size) || Math.max(10, c.r * 0.4);
  const tickR = ((sc && sc.tickR) || g.tick) * c.r;
  const numR = ((sc && sc.numR) || g.num) * c.r;
  if (c.kind === 'enum') {
    c.options.forEach((o, i) => {
      const a = valueAngle(c, o.v);
      const [x1, y1] = polar(c.x, c.y, tickR, a);
      const [x2, y2] = polar(c.x, c.y, tickR + c.r * 0.12, a);
      out.push(<line key={`t${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ctx.ink} strokeWidth="2" />);
      if (o.label) {
        const [tx, ty] = polar(c.x, c.y, numR, a);
        out.push(<PanelText key={`l${i}`} x={tx} y={ty + size * 0.35} text={o.label} size={size} ctx={ctx} />);
      }
    });
    return <g>{out}</g>;
  }
  if (!sc) {
    // Themes with `knobRing` print an unnumbered scale around every plain knob, open at the bottom for the label.
    if (!ctx.theme.knobRing || ctx.outline || c.ring === false) return null;
    if (ctx.theme.knobRing === 'dots') {
      // `knobRing: 'dots'` (Wasp Deluxe): a ring of printed dots instead of a line with ticks
      const dots = [];
      for (let i = 0; i < 21; i++) {
        const [dx, dy] = polar(c.x, c.y, c.r * 1.28, -135 + (270 * i) / 20); // open at the bottom for the name
        dots.push(<circle key={i} cx={dx} cy={dy} r={Math.max(1.6, c.r * 0.05)} />);
      }
      return <g fill={ctx.ink}>{dots}</g>;
    }
    const [ax, ay] = polar(c.x, c.y, tickR, -150);
    const [bx, by] = polar(c.x, c.y, tickR, 150);
    const ticks = [];
    for (let i = 0; i < 11; i++) {
      const a = -150 + 30 * i;
      const [x1, y1] = polar(c.x, c.y, tickR, a);
      const [x2, y2] = polar(c.x, c.y, tickR + c.r * (i % 5 === 0 ? 0.17 : 0.11), a);
      ticks.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />);
    }
    return (
      <g stroke={ctx.ink} strokeWidth={Math.max(1.6, c.r * 0.06)} strokeLinecap="round" fill="none">
        <path d={`M${ax} ${ay} A${tickR} ${tickR} 0 1 1 ${bx} ${by}`} />
        {ticks}
      </g>
    );
  }
  const n = sc.ticks || 0;
  for (let i = 0; i < n; i++) {
    const a = -150 + (300 * i) / (n - 1);
    const [x1, y1] = polar(c.x, c.y, tickR, a);
    const [x2, y2] = polar(c.x, c.y, tickR + c.r * 0.13, a);
    out.push(<line key={`t${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ctx.ink} strokeWidth="2" />);
  }
  const labels = sc.labels || (sc.nums || []).map((v) => ({ at: v, text: String(v).replace('-', '−') }));
  labels.forEach((l, i) => {
    const a = -150 + (300 * (l.at - c.min)) / (c.max - c.min);
    const [tx, ty] = polar(c.x, c.y, numR, a);
    out.push(<PanelText key={`n${i}`} x={tx} y={ty + size * 0.35} text={l.text} size={size} ctx={ctx} />);
  });
  return <g>{out}</g>;
}

function KnobBody({ c, angle, ctx }) {
  const r = c.r;
  const st = c.style;
  if (ctx.outline) {
    const chicken = st === 'd-chicken';
    return (
      <g transform={`translate(${c.x} ${c.y})`} stroke={INK} fill={PAPER}>
        <circle r={r * (chicken ? 0.95 : 1.12)} strokeWidth="2.2" />
        {!chicken && <circle r={r * 0.72} strokeWidth="1.2" />}
        <g transform={`rotate(${angle})`}>
          {chicken && <path d={`M0 ${-r * 1.32} L${r * 0.4} ${-r * 0.2} L${r * 0.3} ${r * 0.75} L${-r * 0.3} ${r * 0.75} L${-r * 0.4} ${-r * 0.2} Z`} strokeWidth="2.2" strokeLinejoin="round" />}
          <line x1="0" y1={-r * 0.25} x2="0" y2={-r * (chicken ? 1.25 : 1.1)} strokeWidth="3.5" strokeLinecap="round" />
        </g>
      </g>
    );
  }
  if (st === 'd-chicken') {
    return (
      <g transform={`translate(${c.x} ${c.y})`}>
        <circle r={r * 1.0} fill="#0a0a0b" opacity="0.55" transform="translate(3 5)" />
        <circle r={r * 0.96} fill="url(#kysBlack)" stroke="#000" strokeWidth="1.5" />
        <g transform={`rotate(${angle})`}>
          <path d={`M0 ${-r * 1.34} L${r * 0.42} ${-r * 0.2} L${r * 0.32} ${r * 0.78} L${-r * 0.32} ${r * 0.78} L${-r * 0.42} ${-r * 0.2} Z`} fill="#2a2b2f" stroke="#4a4b50" strokeWidth="2.5" strokeLinejoin="round" />
          <line x1="0" y1={-r * 0.7} x2="0" y2={-r * 1.26} stroke="#f4f4f0" strokeWidth={r * 0.1} strokeLinecap="round" />
        </g>
        <circle r={r * 0.46} fill="url(#kysSilver)" stroke="#5d6065" strokeWidth="1" />
        <circle r={r * 0.46} fill="url(#kysSheen)" />
      </g>
    );
  }
  if (st === 'pro1') {
    return (
      <g transform={`translate(${c.x} ${c.y})`}>
        <circle r={r} fill="#000" opacity="0.5" transform="translate(3 5)" />
        <circle r={r} fill="url(#kysBlack)" stroke="#000" strokeWidth="1.5" />
        <circle r={r * 0.94} fill="none" stroke="#4a4b4f" strokeWidth={r * 0.1} strokeDasharray="2.5 2.5" />
        <circle r={r * 0.76} fill="#1b1b1d" stroke="#303134" strokeWidth="1.5" />
        <g transform={`rotate(${angle})`}><line x1="0" y1={-r * 0.12} x2="0" y2={-r * 0.96} stroke="#f6f6f2" strokeWidth={r * 0.13} strokeLinecap="round" /></g>
      </g>
    );
  }
  if (st === 'obxa') {
    // Oberheim-style: a black knurled skirt round a smooth black cap, with a white triangle on the rim for the pointer.
    return (
      <g transform={`translate(${c.x} ${c.y})`}>
        <circle r={r} fill="#000" opacity="0.5" transform="translate(3 5)" />
        <circle r={r} fill="url(#kysBlack)" stroke="#000" strokeWidth="1.5" />
        <circle r={r * 0.86} fill="none" stroke="#3e3f43" strokeWidth={r * 0.14} strokeDasharray={`${r * 0.07} ${r * 0.07}`} />
        <circle r={r * 0.68} fill="#1a1a1c" stroke="#2f3033" strokeWidth="1.5" />
        <circle r={r * 0.68} fill="url(#kysSheen)" opacity="0.12" />
        <g transform={`rotate(${angle})`}><path d={`M0 ${-r * 0.97} L${r * 0.13} ${-r * 0.74} L${-r * 0.13} ${-r * 0.74} Z`} fill="#f6f6f2" /></g>
      </g>
    );
  }
  if (st === 'kobol') {
    // Kobol Expander: a black knurled knob with a flat black top and a white dot for the pointer.
    return (
      <g transform={`translate(${c.x} ${c.y})`}>
        <circle r={r} fill="#000" opacity="0.5" transform="translate(3 5)" />
        <circle r={r} fill="url(#kysBlack)" stroke="#000" strokeWidth="1.5" />
        <circle r={r * 0.9} fill="none" stroke="#3a3b3f" strokeWidth={r * 0.12} strokeDasharray={`${r * 0.06} ${r * 0.1}`} />
        <circle r={r * 0.8} fill="#1d1d1f" stroke="#2c2d30" strokeWidth="1.5" />
        <circle r={r * 0.8} fill="url(#kysSheen)" opacity="0.1" />
        <g transform={`rotate(${angle})`}><circle cx="0" cy={-r * 0.56} r={r * 0.13} fill="#f6f6f2" /></g>
      </g>
    );
  }
  if (st === 'cat') {
    // Behringer CAT: a black cap in a white, deeply serrated skirt; the pointer is a white tab standing out of the skirt.
    return (
      <g transform={`translate(${c.x} ${c.y})`}>
        <circle r={r * 1.04} fill="#000" opacity="0.5" transform="translate(3 5)" />
        <circle r={r * 0.9} fill="#e9e9e5" stroke="#8d8d89" strokeWidth="1" />
        <circle r={r * 0.96} fill="none" stroke="#e9e9e5" strokeWidth={r * 0.16} strokeDasharray={`${r * 0.08} ${r * 0.07}`} />
        <circle r={r * 0.72} fill="url(#kysBlack)" stroke="#000" strokeWidth="1.5" />
        <circle r={r * 0.72} fill="url(#kysSheen)" opacity="0.12" />
        <g transform={`rotate(${angle})`}><rect x={-r * 0.09} y={-r * 1.14} width={r * 0.18} height={r * 0.34} rx={r * 0.04} fill="#f6f6f2" stroke="#8d8d89" strokeWidth="0.8" /></g>
      </g>
    );
  }
  if (st === 'wasp') {
    // Behringer Wasp Deluxe: a large yellow cap on a black ribbed skirt, with a black line for the pointer.
    return (
      <g transform={`translate(${c.x} ${c.y})`}>
        <circle r={r * 1.02} fill="#000" opacity="0.5" transform="translate(3 5)" />
        <circle r={r * 1.02} fill="url(#kysBlack)" stroke="#000" strokeWidth="1.5" />
        <circle r={r * 0.95} fill="none" stroke="#38393c" strokeWidth={r * 0.1} strokeDasharray={`${r * 0.06} ${r * 0.06}`} />
        <circle r={r * 0.82} fill="#f4ad1f" stroke="#a86e05" strokeWidth="1.2" />
        <circle r={r * 0.82} fill="url(#kysSheen)" opacity="0.35" />
        <g transform={`rotate(${angle})`}><line x1="0" y1={-r * 0.12} x2="0" y2={-r * 0.8} stroke="#1b1b1b" strokeWidth={r * 0.08} strokeLinecap="round" /></g>
      </g>
    );
  }
  if (st === 'vcs3') {
    // EMS VCS3: a black fluted knob with a coloured cap (`cap`), and a white line on the skirt for the pointer.
    const cap = c.cap || '#f1f1ec';
    return (
      <g transform={`translate(${c.x} ${c.y})`}>
        <circle r={r * 1.06} fill="#000" opacity="0.5" transform="translate(3 5)" />
        <circle r={r * 1.06} fill="url(#kysBlack)" stroke="#000" strokeWidth="1.5" />
        <circle r={r * 0.97} fill="none" stroke="#3c3d41" strokeWidth={r * 0.14} strokeDasharray={`${r * 0.1} ${r * 0.11}`} />
        <g transform={`rotate(${angle})`}><line x1="0" y1={-r * 0.74} x2="0" y2={-r * 1.02} stroke="#f4f4ef" strokeWidth={r * 0.1} strokeLinecap="round" /></g>
        <circle r={r * 0.64} fill="#0d0d0e" />
        <circle r={r * 0.56} fill={cap} stroke="#0008" strokeWidth="1" />
        <circle r={r * 0.56} fill="url(#kysSheen)" opacity="0.55" />
      </g>
    );
  }
  if (st === 'vcs3-dial') {
    // EMS slow-motion dial: a chrome bezel, a black scale ring printed 0–10 that turns with the knob (read against the
    // fixed mark at the top), and a yellow knob in the middle.
    const nums = [];
    for (let n = 0; n <= 10; n++) {
      const a = 150 - 30 * n;
      const [tx, ty] = polar(0, 0, r * 0.84, a);
      nums.push(<text key={n} x={tx} y={ty + r * 0.07} fontSize={r * 0.19} fill="#e9e9e4" textAnchor="middle" fontFamily="'Barlow Semi Condensed', sans-serif" transform={`rotate(${a} ${tx} ${ty})`}>{n}</text>);
      const [x1, y1] = polar(0, 0, r * 0.96, a);
      const [x2, y2] = polar(0, 0, r * 1.03, a);
      nums.push(<line key={`t${n}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e9e9e4" strokeWidth={r * 0.025} />);
    }
    return (
      <g transform={`translate(${c.x} ${c.y})`}>
        <circle r={r * 1.3} fill="#000" opacity="0.45" transform="translate(3 5)" />
        <circle r={r * 1.3} fill="url(#kysSilver)" stroke="#55575b" strokeWidth="1.5" />
        <circle r={r * 1.3} fill="url(#kysSheen)" opacity="0.6" />
        <circle r={r * 1.1} fill="#1a1a1c" stroke="#77797d" strokeWidth="1" />
        <g transform={`rotate(${angle})`}>{nums}</g>
        <path d={`M0 ${-r * 1.08} L${r * 0.08} ${-r * 1.24} L${-r * 0.08} ${-r * 1.24} Z`} fill="#141416" />
        <circle r={r * 0.6} fill="#0c0c0d" />
        <circle r={r * 0.52} fill={c.cap || '#f2e14c'} stroke="#0008" strokeWidth="1" />
        <circle r={r * 0.52} fill="url(#kysSheen)" opacity="0.55" />
      </g>
    );
  }
  if (st === 'neutron' || st === 'neutron-big') {
    // Black knurled skirt with a brushed-metal cap. The white pointer is on the skirt; the cap carries a fine groove.
    const body = st === 'neutron-big' ? 1.15 : 1.14;
    const cap = st === 'neutron-big' ? 0.8 : 0.72;
    return (
      <g transform={`translate(${c.x} ${c.y})`}>
        <circle r={r * body} fill="#000" opacity="0.4" transform="translate(3 5)" />
        <circle r={r * body} fill="url(#kysBlack)" stroke="#000" strokeWidth="1.5" />
        <circle r={r * (body - 0.07)} fill="none" stroke="#45464a" strokeWidth={r * 0.1} strokeDasharray={`${r * 0.09} ${r * 0.09}`} />
        <g transform={`rotate(${angle})`}>
          <line x1="0" y1={-r * (cap + 0.04)} x2="0" y2={-r * (body - 0.05)} stroke="#fff" strokeWidth={r * 0.15} strokeLinecap="round" />
        </g>
        <circle r={r * cap} fill="url(#kysSilver)" stroke="#4d5055" strokeWidth="1.3" />
        <circle r={r * cap} fill="url(#kysSheen)" />
        <g transform={`rotate(${angle})`}>
          <line x1="0" y1={-r * 0.18} x2="0" y2={-r * (cap - 0.06)} stroke="#26272a" strokeWidth={r * 0.08} strokeLinecap="round" />
        </g>
      </g>
    );
  }
  // d-silver
  return (
    <g transform={`translate(${c.x} ${c.y})`}>
      <circle r={r * 1.24} fill="#000" opacity="0.5" transform="translate(3 6)" />
      <circle r={r * 1.24} fill="url(#kysBlack)" stroke="#000" strokeWidth="1.5" />
      <circle r={r * 1.16} fill="none" stroke="#3b3c40" strokeWidth={r * 0.12} strokeDasharray="3 3" />
      <g transform={`rotate(${angle})`}><line x1="0" y1={-r * 0.84} x2="0" y2={-r * 1.2} stroke="#f6f6f2" strokeWidth={r * 0.12} strokeLinecap="round" /></g>
      <circle r={r * 0.82} fill="url(#kysSilver)" stroke="#5d6065" strokeWidth="1.2" />
      <circle r={r * 0.82} fill="url(#kysSheen)" />
    </g>
  );
}

export const Knob = memo(function Knob({ c, value, target, ctx, onChange }) {
  const g = KNOB_GEOM[c.style] || KNOB_GEOM['d-silver'];
  const angle = valueAngle(c, value);
  const hover = useHover('control', c.id);
  const drag = useKnobDrag(c, value, onChange);
  const showGhost = target != null && (c.kind === 'enum' ? target !== value : Math.abs(target - value) > (c.max - c.min) * 0.015);
  const hasScale = c.kind === 'enum' || !!c.scale;
  const extent = c.r * (hasScale && (c.kind === 'enum' ? c.options.some((o) => o.label) : (c.scale.nums || c.scale.labels)) ? g.num + 0.32 : g.body + 0.2);
  let ghost = null;
  if (showGhost) {
    const ta = valueAngle(c, target);
    const [gx, gy] = polar(c.x, c.y, c.r * (g.tick + 0.06), ta);
    ghost = <path transform={`translate(${gx} ${gy}) rotate(${ta})`} d="M0 5 L7 -8 L-7 -8 Z" fill={ACCENT} stroke="#0008" strokeWidth="1" pointerEvents="none" />;
  }
  return (
    <g>
      <KnobScale c={c} ctx={ctx} g={g} />
      <ControlLabel c={c} ctx={ctx} extentTop={extent} extentBottom={c.kind === 'cont' && c.scale && (c.scale.nums || c.scale.labels) && c.labelPos === 'bottom' ? c.r * g.num * 0.87 + 7 : c.r * g.body + 4} />
      <Highlight c={c} r={c.r * 1.62} />
      <KnobBody c={c} angle={angle} ctx={ctx} />
      {ghost}
      <circle cx={c.x} cy={c.y} r={c.r * 1.3} fill="transparent" tabIndex={0} role="slider" aria-label={(c.label || c.id).replace('\n', ' ')}
        aria-valuenow={c.kind === 'cont' ? value : undefined} aria-valuetext={c.kind === 'enum' ? String(value) : undefined}
        className="kys-hit" style={{ cursor: 'ns-resize', touchAction: 'none' }}
        {...hover} {...drag}
        onPointerMove={(e) => { drag.onPointerMove(e); hover.onPointerMove(e); }} />
    </g>
  );
});

// ── Switches ────────────────────────────────────────────────────────────────
// [face, shaded face, highlight, deep shadow]
const ROCKER = {
  red: ['#d8322c', '#a5211c', '#f7837b', '#4a0c09'], blue: ['#1f62d8', '#174ba8', '#78a9f8', '#091e4d'],
  white: ['#e9e9e4', '#bdbdb7', '#ffffff', '#6d6d67'], black: ['#2b2c2f', '#1e1f21', '#55565b', '#050506'],
  // the Poly D's backlit rockers, coloured by what they switch
  orange: ['#ff6a1f', '#d94e10', '#ffae7a', '#5a1d05'], teal: ['#9ad8d4', '#6fb5b0', '#e3fbf9', '#1f4744'],
  green: ['#8fe04c', '#69b92c', '#d4ff9e', '#22460c'],
};

/**
 * A rocker seen from above. The paddle is one V-shaped piece, so the two halves differ only in how they sit and catch the light:
 * the pressed half is sunk into the bezel, narrower, and darkens towards its end; the other half stands proud, overlaps the
 * bezel, brightens towards a lit lip and shows its end wall. Drawn along +x and turned for a vertical rocker; `pos` = pressed half.
 */
function RockerBody({ c, pos }) {
  const vert = c.orient === 'v';
  const L = vert ? c.h : c.w;
  const T = vert ? c.w : c.h;
  const k = ROCKER[c.color] ? c.color : 'red';
  const E = L / 2 + 3; // the raised end reaches over the bezel
  const g = 2; // and looks wider, being nearer the eye
  const P = L / 2 - 2;
  const lit = vert ? 1 : -1; // the long edge that faces the light (top left of the panel)
  const mirror = (on) => (on ? 'scale(-1 1)' : undefined);
  return (
    <g transform={`translate(${c.x} ${c.y})${vert ? ' rotate(90)' : ''}`}>
      <rect x={-L / 2 - 5} y={-T / 2 - 5} width={L + 10} height={T + 10} rx="7" fill="#08080a" stroke="#2a2b2e" strokeWidth="1.5" />
      <rect x={-L / 2 - 1} y={-T / 2 - 1} width={L + 2} height={T + 2} rx="3" fill="#000" />
      <g transform={mirror(pos === 0)}>
        <path d={`M0 ${-T / 2} L${P} ${-T / 2 + 1.5} V${T / 2 - 1.5} L0 ${T / 2} Z`} fill={`url(#kysRkDn-${k})`} />
        <path d={`M0 ${-T / 2 + 1} L${P - 1} ${-T / 2 + 2.5} V${T / 2 - 2.5} L0 ${T / 2 - 1}`} fill="none" stroke="#000" strokeWidth="5" opacity="0.38" strokeLinejoin="round" />
      </g>
      <g transform={mirror(pos === 1)}>
        <path d={`M${E - 1} ${-T / 2 - g + 2} H${E + 1.5} Q${E + 3.5} ${-T / 2 - g + 2} ${E + 3.5} ${-T / 2 - g + 4} V${T / 2 + g - 4} Q${E + 3.5} ${T / 2 + g - 2} ${E + 1.5} ${T / 2 + g - 2} H${E - 1} Z`} fill={`url(#kysRkEnd-${k})`} />
        <path d={`M0 ${-T / 2} L${E - 3} ${-T / 2 - g} Q${E} ${-T / 2 - g} ${E} ${-T / 2 - g + 3} V${T / 2 + g - 3} Q${E} ${T / 2 + g} ${E - 3} ${T / 2 + g} L0 ${T / 2} Z`} fill={`url(#kysRkUp-${k})`} />
        <path d={`M3 ${lit * (T / 2 - 0.4)} L${E - 4} ${lit * (T / 2 + g - 1.4)}`} stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
        <path d={`M3 ${-lit * (T / 2 - 0.4)} L${E - 4} ${-lit * (T / 2 + g - 1.4)}`} stroke="#000" strokeWidth="1.6" strokeLinecap="round" opacity="0.3" />
        <path d={`M${E - 1.2} ${-T / 2 - g + 3.5} V${T / 2 + g - 3.5}`} stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" />
      </g>
      <line x1="0" y1={-T / 2} x2="0" y2={T / 2} stroke="#000" strokeWidth="1.8" opacity="0.5" />
    </g>
  );
}

/** A three-position rocker (Poly D MODE): one wide paddle in three segments, the chosen one pressed in. */
function Rocker3Body({ c, pos }) {
  const k = ROCKER[c.color] ? c.color : 'red';
  const [face, shade, hi, deep] = ROCKER[k];
  const { x, y, w, h } = c;
  const sw = w / 3;
  return (
    <g>
      <rect x={x - w / 2 - 5} y={y - h / 2 - 5} width={w + 10} height={h + 10} rx="7" fill="#08080a" stroke="#2a2b2e" strokeWidth="1.5" />
      {[0, 1, 2].map((i) => {
        const sx = x - w / 2 + i * sw;
        const down = i === pos;
        return (
          <g key={i}>
            {/* the chosen segment is pressed in and lit; the others sit dark */}
            <rect x={sx + 0.5} y={y - h / 2 + (down ? 1.5 : -1)} width={sw - 1} height={h + (down ? -3 : 2)} rx="2.5" fill={down ? face : deep} stroke="#000" strokeOpacity="0.45" strokeWidth="1" />
            {down && <rect x={sx + 3} y={y - h / 2 + 3} width={sw - 6} height={h * 0.3} rx="2" fill={hi} opacity="0.6" />}
            {!down && <rect x={sx + 1} y={y - h / 2} width={sw - 2} height={h * 0.3} rx="2" fill={shade} opacity="0.35" />}
          </g>
        );
      })}
    </g>
  );
}

function nextValue(c, value) {
  if (c.kind === 'bool') return !value;
  return c.options[(optionIndex(c, value) + 1) % c.options.length].v;
}

/** index of the active position: 0 = left/top. */
function switchPos(c, value) {
  if (c.kind === 'bool') {
    if (c.type === 'rocker') return value ? (c.orient === 'v' ? 0 : 1) : c.orient === 'v' ? 1 : 0;
    return (c.onAt === 'bottom' ? !value : value) ? 0 : 1;
  }
  return optionIndex(c, value);
}

export const Switch = memo(function Switch({ c, value, target, ctx, onChange }) {
  const hover = useHover('control', c.id);
  const vert = c.orient === 'v';
  const { x, y, w, h } = c;
  const n = c.kind === 'bool' ? 2 : c.options.length;
  const pos = switchPos(c, value);
  const tpos = target != null && target !== value ? switchPos(c, target) : null;
  let body;
  if (c.type === 'button' && c.face === 'ring') {
    body = <RingButton c={c} lit={c.kind === 'bool' ? !!value : optionIndex(c, value) > 0} ctx={ctx} />;
  } else if (c.type === 'button' && c.lamp) {
    // `lit: 'always'` – a button that steps through a list and is lit whatever it is on (Poly D STEP)
    body = <LampButton x={x} y={y} w={w} h={h} lamp={c.lamp} lit={c.kind === 'bool' ? !!value : c.lit === 'always' || optionIndex(c, value) > 0} ctx={ctx} />;
  } else if (c.type === 'button') {
    body = ctx.outline
      ? <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="3" fill={PAPER} stroke={INK} strokeWidth="2" />
      : ctx.theme.bezel
        ? (<g><rect x={x - w / 2 - 4} y={y - h / 2 - 4} width={w + 8} height={h + 8} rx="5" fill="#141416" stroke="#000" strokeWidth="1" /><rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="2.5" fill="url(#kysButton)" stroke="#6d6e72" strokeWidth="1" /></g>)
        : c.capColor
          // `capColor` (the Jupiters' coloured square caps): a flat cap of that colour with a lighter top edge;
          // with `capLamp` the cap carries its own lamp, lit when the button is on
          ? (c.capLamp ? <CapButton x={x} y={y} w={w} h={h} color={c.capColor} lit={c.kind === 'bool' ? !!value : optionIndex(c, value) > 0} ctx={ctx} />
            : (<g><rect x={x - w / 2 + 2} y={y - h / 2 + 3} width={w} height={h} rx="3" fill="#0007" /><rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="3" fill={c.capColor} stroke="#0008" strokeWidth="1.2" /><rect x={x - w / 2 + 3} y={y - h / 2 + 2} width={w - 6} height={h * 0.28} rx="2" fill="#fff" opacity="0.22" /></g>))
          : (<g><rect x={x - w / 2 + 2} y={y - h / 2 + 3} width={w} height={h} rx="3" fill="#0006" /><rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="3" fill={(c.cap || ctx.theme.button) === 'black' ? 'url(#kysButtonBlack)' : 'url(#kysButton)'} stroke="#4c4d50" strokeWidth="1.2" /></g>);
  } else if (c.type === 'toggle') {
    // a small bat-handle toggle seen from above (Wasp Deluxe HOLD): the bat leans towards the position it is in
    // three positions (Easel): up, centre, down. `tip` colours the bat's end, as on the Easel's coloured toggles.
    // `orient: 'h'` (Grandmother): the bat throws left, centre, right; `lean` is how far it reaches, in radii.
    const r = w / 2;
    const off = (n === 3 ? pos - 1 : pos === 0 ? -1 : 1) * r * (c.lean || 0.42);
    const bx = c.orient === 'h' ? x + off : x;
    const by = c.orient === 'h' ? y : y + off;
    body = ctx.outline ? (
      <g stroke={INK} strokeWidth="2" fill={PAPER}><circle cx={x} cy={y} r={r} /><circle cx={bx} cy={by} r={r * 0.36} fill={INK} stroke="none" /></g>
    ) : (
      <g>
        <circle cx={x + 2} cy={y + 3} r={r} fill="#0007" />
        <circle cx={x} cy={y} r={r} fill="url(#kysNut)" stroke="#0009" strokeWidth="1.2" />
        <circle cx={x} cy={y} r={r * 0.55} fill="#1a1a1b" />
        <line x1={x} y1={y} x2={bx} y2={by} stroke="#d6d6d0" strokeWidth={r * 0.4} strokeLinecap="round" />
        <circle cx={bx} cy={by} r={r * (c.tip ? 0.42 : 0.3)} fill={c.tip || '#eeeeea'} stroke={c.tip ? '#0008' : '#77777a'} strokeWidth="1" />
      </g>
    );
  } else if (c.type === 'rocker') {
    const half = (i) => (vert ? { x: x - w / 2, y: y - h / 2 + (i * h) / n, width: w, height: h / n } : { x: x - w / 2 + (i * w) / n, y: y - h / 2, width: w / n, height: h });
    if (ctx.outline) {
      const p = half(pos);
      body = (
        <g stroke={INK} strokeWidth="2" fill={PAPER}>
          <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="5" />
          <rect {...p} fill={INK} opacity="0.82" stroke="none" rx="4" />
          {n === 2 && (vert ? <line x1={x - w / 2} y1={y} x2={x + w / 2} y2={y} /> : <line x1={x} y1={y - h / 2} x2={x} y2={y + h / 2} />)}
        </g>
      );
    } else {
      body = n === 3 ? <Rocker3Body c={c} pos={pos} /> : <RockerBody c={c} pos={pos} />;
    }
  } else {
    // slide switch
    const seg = (vert ? h : w) / n;
    const nub = (i, extra) => (vert
      ? { x: x - w / 2 + 3, y: y - h / 2 + i * seg + 3, width: w - 6, height: seg - 6, ...extra }
      : { x: x - w / 2 + i * seg + 3, y: y - h / 2 + 3, width: seg - 6, height: h - 6, ...extra });
    body = ctx.outline ? (
      <g stroke={INK} strokeWidth="2" fill={PAPER}><rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="4" /><rect {...nub(pos)} rx="2" fill={INK} opacity="0.82" stroke="none" /></g>
    ) : (
      <g>
        <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="4" fill="#050506" stroke="#3a3b3f" strokeWidth="1.5" />
        <rect {...nub(pos)} rx="2.5" fill="url(#kysNub)" stroke="#6a6b70" strokeWidth="1" />
      </g>
    );
  }
  let ghost = null;
  if (tpos != null && c.type !== 'button') {
    const f = (tpos + 0.5) / n - 0.5;
    ghost = <circle cx={vert ? x + w / 2 + 9 : x + f * w} cy={vert ? y + f * h : y - h / 2 - 9} r="5" fill={ACCENT} stroke="#0008" pointerEvents="none" />;
  } else if (tpos != null) {
    ghost = <circle cx={x + w / 2 + 6} cy={y - h / 2 - 6} r="5" fill={ACCENT} stroke="#0008" pointerEvents="none" />;
  }
  return (
    <g>
      <ControlLabel c={c} ctx={ctx} extentTop={h / 2 + 9} extentBottom={c.labelPos === 'bottom' ? h / 2 + 4 : w / 2 + 8} />
      <Highlight c={c} r={Math.max(w, h) * 0.78} />
      {body}
      {ghost}
      <rect x={x - w / 2 - 5} y={y - h / 2 - 5} width={w + 10} height={h + 10} fill="transparent" tabIndex={0} role="button"
        aria-label={(c.label || c.id).replace('\n', ' ')} className="kys-hit" style={{ cursor: 'pointer' }} {...hover}
        onClick={(e) => { focusStore.set({ kind: 'control', id: c.id, x: e.clientX, y: e.clientY, tip: false }); onChange(c.id, nextValue(c, value)); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(c.id, nextValue(c, value)); } }} />
    </g>
  );
});

// ── Fader ───────────────────────────────────────────────────────────────────
// A slide potentiometer. (x, y) is the centre of its travel, `len` the travel, `orient` 'v' (max at the top) or 'h'
// (max on the right). `led` colours the lamp in the cap, as on the 2600 where it shows which module the slider belongs to.
const FADER_LED = { blue: '#58a6ff', green: '#5ee872', red: '#ff4238', yellow: '#ffd23a', white: '#fffbe8', amber: '#ffb020' };
// `cap`: a round, coloured cap instead of the lamp cap (the CAT's white, red and grey sliders). [face, rim]
const FADER_BALL = { white: ['#fbfbf8', '#c4c4bf'], red: ['#f2231b', '#a3130d'], grey: ['#a4a4a1', '#6b6b68'],
  // the Easel's slider caps, coloured by section
  blue: ['#2f63c9', '#1b3d86'], green: ['#2f9a4a', '#1c6630'], yellow: ['#f2c51c', '#a8850c'], black: ['#26272a', '#0b0b0c'] };

function useFaderDrag(c, value, onChange) {
  const drag = useRef(null);
  const vert = c.orient !== 'h';
  const span = c.max - c.min;
  const set = (v) => onChange(c.id, Math.round(Math.max(c.min, Math.min(c.max, v)) * 100) / 100);
  return {
    onPointerDown: (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const svg = e.currentTarget.ownerSVGElement;
      const m = svg && svg.getScreenCTM();
      drag.current = { x: e.clientX, y: e.clientY, v: value, px: m ? m.a : 1 }; // screen pixels per view unit
      focusStore.set({ kind: 'control', id: c.id, x: e.clientX, y: e.clientY, tip: false });
    },
    onPointerMove: (e) => {
      const d = drag.current;
      if (!d) return;
      const moved = (vert ? d.y - e.clientY : e.clientX - d.x) / d.px; // in view units along the travel
      set(d.v + (moved / (c.len || 200)) * span * (e.shiftKey ? 0.2 : 1));
    },
    onPointerUp: (e) => {
      drag.current = null;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    },
    onDoubleClick: () => onChange(c.id, null),
    onKeyDown: (e) => {
      const up = e.key === 'ArrowUp' || e.key === 'ArrowRight';
      const down = e.key === 'ArrowDown' || e.key === 'ArrowLeft';
      if (!up && !down) return;
      e.preventDefault();
      const step = span / (e.shiftKey ? 200 : 50);
      set(value + (up ? step : -step));
    },
  };
}

export const Fader = memo(function Fader({ c, value, target, ctx, onChange }) {
  const hover = useHover('control', c.id);
  const drag = useFaderDrag(c, value, onChange);
  const vert = c.orient !== 'h';
  const len = c.len || 200;
  const at = (v) => {
    const f = (Math.max(c.min, Math.min(c.max, v)) - c.min) / (c.max - c.min);
    return vert ? [c.x, c.y + len / 2 - f * len] : [c.x - len / 2 + f * len, c.y];
  };
  const [cx, cy] = at(value);
  const pad = c.pad == null ? 12 : c.pad; // how far the slot runs on past each end of the travel
  const slot = vert ? { x: c.x - 7, y: c.y - len / 2 - pad, width: 14, height: len + pad * 2 } : { x: c.x - len / 2 - pad, y: c.y - 7, width: len + pad * 2, height: 14 };
  const ball = c.cap ? FADER_BALL[c.cap] || FADER_BALL.white : null;
  const capW = ball ? 34 : vert ? 26 : 20;
  const capH = ball ? 34 : vert ? 20 : 26;
  const nTicks = c.ticks == null ? (vert ? 5 : 0) : c.ticks;
  const ticks = [];
  for (let i = 0; i < nTicks; i++) {
    if (c.tickEnds === false && (i === 0 || i === nTicks - 1)) continue; // MAX / MIN are printed there instead
    const f = nTicks === 1 ? 0.5 : i / (nTicks - 1);
    const p = vert ? c.y + len / 2 - f * len : c.x - len / 2 + f * len;
    // printed hard against the slot, as on the 2600, so they stay clear of the section lines between the sliders
    const side = c.tickSide === 'left' ? -1 : 1;
    ticks.push(vert
      ? <line key={i} x1={c.x + side * 15} y1={p} x2={c.x + side * 23.5} y2={p} />
      : <line key={i} x1={p} y1={c.y - 15} x2={p} y2={c.y - 23.5} />);
  }
  const led = FADER_LED[c.led] || FADER_LED.white;
  const showGhost = target != null && Math.abs(target - value) > (c.max - c.min) * 0.015;
  let ghost = null;
  if (showGhost) {
    const [gx, gy] = at(target);
    ghost = vert
      ? <path transform={`translate(${c.x - 20} ${gy})`} d="M5 0 L-8 -7 L-8 7 Z" fill={ACCENT} stroke="#0008" strokeWidth="1" pointerEvents="none" />
      : <path transform={`translate(${gx} ${c.y + 20})`} d="M0 -5 L-7 8 L7 8 Z" fill={ACCENT} stroke="#0008" strokeWidth="1" pointerEvents="none" />;
  }
  const hl = { x: slot.x - 20, y: slot.y - 8, width: slot.width + 40, height: slot.height + 16 };
  return (
    <g>
      <ControlLabel c={c} ctx={ctx} extentTop={vert ? len / 2 + 16 : 18} extentBottom={vert ? len / 2 + 14 : 18} />
      <FaderHighlight c={c} r={hl} />
      <g stroke={ctx.ink} strokeWidth="2.2" strokeLinecap="round" opacity={ctx.outline ? 0.8 : 0.9}>{ticks}</g>
      {ctx.outline ? (
        <g>
          <rect {...slot} rx="7" fill={PAPER} stroke={INK} strokeWidth="1.8" />
          <rect x={cx - capW / 2} y={cy - capH / 2} width={capW} height={capH} rx="3" fill={INK} />
          {vert ? <line x1={cx - capW / 2 + 5} y1={cy} x2={cx + capW / 2 - 5} y2={cy} stroke={PAPER} strokeWidth="3" /> : <line x1={cx} y1={cy - capH / 2 + 5} x2={cx} y2={cy + capH / 2 - 5} stroke={PAPER} strokeWidth="3" />}
        </g>
      ) : ball ? (
        <g>
          <rect {...slot} rx="7" fill="#040405" stroke="#2c2d31" strokeWidth="1.5" />
          <circle cx={cx + 2} cy={cy + 4} r={capW / 2} fill="#000" opacity="0.5" />
          <circle cx={cx} cy={cy} r={capW / 2} fill={ball[0]} stroke={ball[1]} strokeWidth="2" />
          <circle cx={cx - capW * 0.15} cy={cy - capW * 0.15} r={capW * 0.18} fill="#fff" opacity="0.35" />
        </g>
      ) : (
        <g>
          <rect {...slot} rx="7" fill="#040405" stroke="#2c2d31" strokeWidth="1.5" />
          <rect x={cx - capW / 2 + 2} y={cy - capH / 2 + 4} width={capW} height={capH} rx="4" fill="#000" opacity="0.5" />
          <ellipse cx={cx} cy={cy} rx={vert ? capW * 0.9 : capW * 0.75} ry={vert ? capH * 0.75 : capH * 0.9} fill={led} opacity="0.2" />
          <rect x={cx - capW / 2} y={cy - capH / 2} width={capW} height={capH} rx="4" fill="#1d1e21" stroke="#3d3e43" strokeWidth="1.2" />
          <rect x={vert ? cx - capW / 2 + 4 : cx - 3.5} y={vert ? cy - 3.5 : cy - capH / 2 + 4} width={vert ? capW - 8 : 7} height={vert ? 7 : capH - 8} rx="3.5" fill={led} />
          <rect x={vert ? cx - capW / 2 + 7 : cx - 1.5} y={vert ? cy - 1.5 : cy - capH / 2 + 7} width={vert ? capW - 14 : 3} height={vert ? 3 : capH - 14} rx="1.5" fill="#fff" opacity="0.75" />
        </g>
      )}
      {ghost}
      <rect x={Math.min(slot.x, cx - capW / 2) - 6} y={Math.min(slot.y, cy - capH / 2) - 6} width={Math.max(slot.width, capW) + 12} height={Math.max(slot.height, capH) + 12}
        fill="transparent" tabIndex={0} role="slider" aria-label={(c.label || c.id).replace('\n', ' ')} aria-orientation={vert ? 'vertical' : 'horizontal'}
        aria-valuenow={value} aria-valuemin={c.min} aria-valuemax={c.max}
        className="kys-hit" style={{ cursor: vert ? 'ns-resize' : 'ew-resize', touchAction: 'none' }}
        {...hover} {...drag}
        onPointerMove={(e) => { drag.onPointerMove(e); hover.onPointerMove(e); }} />
    </g>
  );
});

function FaderHighlight({ c, r }) {
  const on = useStore(highlightStore, (ids) => ids.includes(c.id));
  if (!on) return null;
  const col = moduleOf(c.module).color;
  return (
    <g pointerEvents="none">
      <rect {...r} rx="16" fill={col} opacity="0.16" />
      <rect {...r} rx="16" className="kys-pulse" fill="none" stroke={col} strokeWidth="4" />
    </g>
  );
}

// ── Jack ────────────────────────────────────────────────────────────────────
/** Banana socket collars (Jack `banana`; any other value is used as a colour). */
const BANANA = { black: '#19191b', orange: '#f0501e', yellow: '#f4d250', blue: '#3e9ad8', white: '#efefea', violet: '#9b8fd6', green: '#2fa05a', red: '#c8161d' };
export const Jack = memo(function Jack({ j, ctx, pending, onJack }) {
  const hover = useHover('jack', j.id);
  const r = j.r || 16;
  const hex = [0, 60, 120, 180, 240, 300].map((a) => polar(j.x, j.y, r, a + 30).join(',')).join(' ');
  const size = j.labelSize || Math.max(10, r * 0.7);
  const hl = useStore(highlightStore, (ids) => ids.includes(j.id));
  const ly = j.labelPos === 'bottom' ? j.y + r + size + 4 : j.y - r - 8;
  // Themes with `outPlates` print output names on a solid plate, so ins and outs read apart at a glance.
  const showLabel = j.label && j.labelPos !== 'none';
  const plate = ctx.theme.outPlates && !ctx.outline && j.dir === 'out' && showLabel;
  const pw = plate ? j.label.length * size * 0.56 + 9 : 0;
  return (
    <g>
      {plate && <rect x={j.x - pw / 2} y={ly - size * 0.35 - size * 0.68} width={pw} height={size * 1.36} rx="3" fill={ctx.ink} />}
      {showLabel && <PanelText x={j.x} y={ly} text={j.label} size={size} fill={plate ? ctx.panelFill : undefined} weight={plate ? 600 : undefined} ctx={ctx} />}
      {hl && <circle className="kys-pulse" cx={j.x} cy={j.y} r={r * 1.7} fill="none" stroke="#ff5d8f" strokeWidth="4" pointerEvents="none" />}
      {ctx.outline ? (
        <g stroke={INK} fill={PAPER} strokeWidth="1.8"><polygon points={hex} /><circle cx={j.x} cy={j.y} r={r * 0.55} />{j.dir === 'out' && <circle cx={j.x} cy={j.y} r={r * 0.2} fill={INK} />}</g>
      ) : j.banana ? (
        // a banana socket (Easel): a coloured plastic collar, coded by what the jack carries
        <g>
          <circle cx={j.x + 1.5} cy={j.y + 2.5} r={r * 1.02} fill="#0006" />
          <circle cx={j.x} cy={j.y} r={r} fill={BANANA[j.banana] || j.banana} stroke="#0007" strokeWidth="1.2" />
          <circle cx={j.x - r * 0.3} cy={j.y - r * 0.35} r={r * 0.28} fill="#fff" opacity="0.25" />
          <circle cx={j.x} cy={j.y} r={r * 0.5} fill="#bdbdb6" stroke="#0008" strokeWidth="1" />
          <circle cx={j.x} cy={j.y} r={r * 0.3} fill="#070707" />
        </g>
      ) : ctx.theme.jack === 'black' ? (
        <g>
          <circle cx={j.x} cy={j.y} r={r * 1.02} fill="url(#kysBlack)" stroke="#000" strokeWidth="1.2" />
          <circle cx={j.x} cy={j.y} r={r * 0.68} fill="url(#kysNut)" stroke="#2a2b2e" strokeWidth="1" />
          <circle cx={j.x} cy={j.y} r={r * 0.46} fill="#050505" />
        </g>
      ) : (
        <g>
          <polygon points={hex} fill="url(#kysNut)" stroke="#0009" strokeWidth="1.2" />
          <circle cx={j.x} cy={j.y} r={r * 0.64} fill="#b8b8b2" stroke="#55565a" strokeWidth="1" />
          <circle cx={j.x} cy={j.y} r={r * 0.46} fill="#050505" />
        </g>
      )}
      {pending && <circle className="kys-pulse" cx={j.x} cy={j.y} r={r * 1.45} fill="none" stroke="#fff" strokeWidth="3" pointerEvents="none" />}
      <circle cx={j.x} cy={j.y} r={r * 1.25} fill="transparent" tabIndex={0} role="button" aria-label={`${j.label} ${j.dir === 'out' ? 'output' : 'input'} jack`}
        className="kys-hit" style={{ cursor: 'crosshair' }} {...hover}
        onClick={(e) => { e.stopPropagation(); onJack(j.id, e); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onJack(j.id, e); } }} />
    </g>
  );
});

/**
 * A patch cable. `plugs` = [handlers for the `a` end, handlers for the `b` end] makes the two plugs draggable, so a
 * connected end can be moved to another jack; without it the plugs are just part of the cable. `passive` lets clicks through.
 */
export function Cable({ a, b, color, scale = 1, onRemove, ghost, active, faded, hover, plugs, passive }) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const sag = (50 + dist * 0.32) * scale;
  const d = `M${a.x} ${a.y} C${a.x} ${a.y + sag} ${b.x} ${b.y + sag} ${b.x} ${b.y}`;
  const pr = (a.r || 16) * 0.78;
  return (
    <g opacity={ghost ? 0.7 : faded ? 0.32 : 1} style={ghost || passive ? { pointerEvents: 'none' } : { cursor: 'pointer' }} onClick={onRemove} {...(hover || {})}>
      {active && <path d={d} fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth={15 * scale} strokeLinecap="round" />}
      <path d={d} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth={13 * scale} strokeLinecap="round" transform="translate(3 6)" />
      <path d={d} fill="none" stroke={color} strokeWidth={9 * scale} strokeLinecap="round" />
      <path d={d} fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth={2.5 * scale} strokeLinecap="round" transform="translate(-1.5 -1.5)" />
      {[a, b].map((p, i) => (
        <g key={i} {...(plugs ? plugs[i] : {})} style={plugs ? { cursor: 'grab', touchAction: 'none', pointerEvents: 'auto' } : undefined}>
          {plugs && <circle cx={p.x} cy={p.y} r={pr * 1.5} fill="transparent" />}
          <circle cx={p.x} cy={p.y} r={pr} fill={color} stroke="#0009" strokeWidth="1.5" /><circle cx={p.x} cy={p.y} r={pr * 0.45} fill="#0007" />
        </g>
      ))}
    </g>
  );
}

export function PanelDefs() {
  return (
    <defs>
      <linearGradient id="kysSilver" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fbfbfa" /><stop offset="0.45" stopColor="#c9cbce" /><stop offset="0.7" stopColor="#9da0a5" /><stop offset="1" stopColor="#d9dbdd" />
      </linearGradient>
      <radialGradient id="kysSheen" cx="0.32" cy="0.28" r="0.6"><stop offset="0" stopColor="#fff" stopOpacity="0.85" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
      <radialGradient id="kysBlack" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stopColor="#3b3c40" /><stop offset="0.55" stopColor="#17171a" /><stop offset="1" stopColor="#060607" /></radialGradient>
      <linearGradient id="kysNut" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f2f2ee" /><stop offset="0.5" stopColor="#a9aaad" /><stop offset="1" stopColor="#dcdcd8" /></linearGradient>
      <radialGradient id="kysScrew" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#8d8e92" /><stop offset="1" stopColor="#2c2d30" /></radialGradient>
      <linearGradient id="kysButton" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dcdcd9" /><stop offset="1" stopColor="#9c9d9f" /></linearGradient>
      <linearGradient id="kysButtonBlack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4a4b4f" /><stop offset="0.15" stopColor="#333437" /><stop offset="1" stopColor="#1e1f21" /></linearGradient>
      <linearGradient id="kysNub" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5a5b60" /><stop offset="1" stopColor="#2a2b2e" /></linearGradient>
      <linearGradient id="kysWood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5a2e16" /><stop offset="0.5" stopColor="#7d4423" /><stop offset="1" stopColor="#4a2511" /></linearGradient>
      <linearGradient id="kysMetal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1b1c1f" /><stop offset="0.5" stopColor="#34363a" /><stop offset="1" stopColor="#141517" /></linearGradient>
      {Object.entries(ROCKER).map(([k, [face, shade, hi, deep]]) => (
        <Fragment key={k}>
          <linearGradient id={`kysRkUp-${k}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={shade} /><stop offset="0.3" stopColor={face} /><stop offset="0.78" stopColor={hi} /><stop offset="1" stopColor={face} /></linearGradient>
          <linearGradient id={`kysRkDn-${k}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={shade} /><stop offset="1" stopColor={deep} /></linearGradient>
          <linearGradient id={`kysRkEnd-${k}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={shade} /><stop offset="1" stopColor={deep} /></linearGradient>
        </Fragment>
      ))}
      {/* Faceplate artwork: grey print over the panel colour. */}
      <pattern id="kysPatStripes" width="26" height="12" patternUnits="userSpaceOnUse"><path d="M0 0h3v12h-3zM8 0h7v12h-7zM19 0h2v12h-2z" fill="#d6cdcb" fillOpacity="0.5" /></pattern>
      <pattern id="kysPatDots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="2.7" fill="#d6cdcb" fillOpacity="0.55" /><circle cx="10.5" cy="10.5" r="2.7" fill="#d6cdcb" fillOpacity="0.55" /></pattern>
      <pattern id="kysPatFine" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" fill="#d6cdcb" fillOpacity="0.6" /><circle cx="6" cy="6" r="1.3" fill="#d6cdcb" fillOpacity="0.6" /></pattern>
      <pattern id="kysPatMesh" width="11" height="11" patternUnits="userSpaceOnUse"><path d="M0 0h11v11h-11zM5.5 1.6L9.4 5.5L5.5 9.4L1.6 5.5Z" fill="#d6cdcb" fillOpacity="0.5" fillRule="evenodd" /></pattern>
      <pattern id="kysPatWaves" width="56" height="11" patternUnits="userSpaceOnUse"><path d="M0 5.5Q14 0 28 5.5T56 5.5" fill="none" stroke="#d6cdcb" strokeOpacity="0.55" strokeWidth="2.4" /></pattern>
      <pattern id="kysPatScales" width="64" height="32" patternUnits="userSpaceOnUse">
        <g fill="none" stroke="#d6cdcb" strokeOpacity="0.5" strokeWidth="2">
          <circle cx="32" cy="32" r="30" /><circle cx="32" cy="32" r="21" /><circle cx="32" cy="32" r="12" />
          <circle cx="0" cy="16" r="30" /><circle cx="0" cy="16" r="21" /><circle cx="0" cy="16" r="12" />
          <circle cx="64" cy="16" r="30" /><circle cx="64" cy="16" r="21" /><circle cx="64" cy="16" r="12" />
        </g>
      </pattern>
      <pattern id="kysPatBay" width="72" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-16)"><path d="M0 4.5Q18 1 36 4.5T72 4.5" fill="none" stroke="#ffd2cc" strokeOpacity="0.3" strokeWidth="1.6" /></pattern>
      <linearGradient id="kysLcdGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.35" /><stop offset="1" stopColor="#9fb3ad" stopOpacity="0.25" /></linearGradient>
      <pattern id="kysGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#1c2530" strokeOpacity="0.07" strokeWidth="1" /></pattern>
    </defs>
  );
}

// ── Joystick ────────────────────────────────────────────────────────────────
/**
 * A two-axis joystick seen from above (EMS VCS3). Two controls share it: `c` (type 'joystick') is the left-right axis
 * and `c.pair` names the up-down one; both are cont −1..1. Drag anywhere on the base to move the stick; arrow keys
 * nudge it; double-click puts both axes back where the sound had them.
 */
export const Joystick = memo(function Joystick({ c, value, value2, target, ctx, onChange }) {
  const hover = useHover('control', c.id);
  const drag = useRef(null);
  const R = c.r;
  const reach = R * 0.62;
  const x = typeof value === 'number' ? value : 0;
  const y = typeof value2 === 'number' ? value2 : 0;
  const kx = c.x + x * reach, ky = c.y - y * reach;
  const set = (e) => {
    const svg = e.currentTarget.ownerSVGElement;
    const m = svg && svg.getScreenCTM();
    if (!m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const cl = (v) => Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100;
    onChange(c.id, cl((p.x - c.x) / reach));
    onChange(c.pair, cl((c.y - p.y) / reach));
  };
  const ghost = target != null && Math.abs(target - x) > 0.04
    ? <circle cx={c.x + target * reach} cy={c.y - y * reach} r="6" fill={ACCENT} stroke="#0008" pointerEvents="none" /> : null;
  return (
    <g>
      <ControlLabel c={c} ctx={ctx} extentTop={R + 10} extentBottom={R + 6} />
      <Highlight c={c} r={R * 1.25} />
      {ctx.outline ? (
        <g stroke={INK} fill={PAPER} strokeWidth="2">
          <circle cx={c.x} cy={c.y} r={R} />
          <rect x={c.x - reach} y={c.y - reach} width={reach * 2} height={reach * 2} fill="none" strokeDasharray="5 5" strokeWidth="1.2" />
          <line x1={c.x} y1={c.y} x2={kx} y2={ky} strokeWidth="5" strokeLinecap="round" />
          <circle cx={kx} cy={ky} r={R * 0.16} fill={INK} />
        </g>
      ) : (
        <g>
          <circle cx={c.x + 3} cy={c.y + 6} r={R} fill="#000" opacity="0.45" />
          <circle cx={c.x} cy={c.y} r={R} fill="url(#kysBlack)" stroke="#000" strokeWidth="2" />
          <circle cx={c.x} cy={c.y} r={R * 0.8} fill="#0b0b0c" stroke="#333438" strokeWidth="2" />
          <rect x={c.x - reach} y={c.y - reach} width={reach * 2} height={reach * 2} rx="6" fill="none" stroke="#2a2b2e" strokeWidth="2" />
          <circle cx={c.x} cy={c.y} r={R * 0.2} fill="#222326" />
          <line x1={c.x + 4} y1={c.y + 7} x2={kx + 4} y2={ky + 7} stroke="#000" strokeOpacity="0.5" strokeWidth={R * 0.17} strokeLinecap="round" />
          <line x1={c.x} y1={c.y} x2={kx} y2={ky} stroke="url(#kysSilver)" strokeWidth={R * 0.15} strokeLinecap="round" />
          <circle cx={kx} cy={ky} r={R * 0.14} fill="url(#kysSilver)" stroke="#55575b" strokeWidth="1" />
          <circle cx={kx} cy={ky} r={R * 0.14} fill="url(#kysSheen)" />
        </g>
      )}
      {ghost}
      <circle cx={c.x} cy={c.y} r={R} fill="transparent" tabIndex={0} role="slider" aria-label="Joystick"
        aria-valuetext={`left-right ${x.toFixed(2)}, up-down ${y.toFixed(2)}`} className="kys-hit" style={{ cursor: 'move', touchAction: 'none' }}
        {...hover}
        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; focusStore.set({ kind: 'control', id: c.id, x: e.clientX, y: e.clientY, tip: false }); set(e); }}
        onPointerMove={(e) => { if (drag.current) set(e); else hover.onPointerMove(e); }}
        onPointerUp={(e) => { drag.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ } }}
        onDoubleClick={() => { onChange(c.id, null); onChange(c.pair, null); }}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 0.02 : 0.1;
          const cl = (v) => Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onChange(c.id, cl(x + (e.key === 'ArrowRight' ? d : -d))); }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onChange(c.pair, cl(y + (e.key === 'ArrowUp' ? d : -d))); }
        }} />
    </g>
  );
});

// ── Pin matrix ──────────────────────────────────────────────────────────────
/**
 * A pin patch matrix (EMS VCS3), from the SynthDef's `matrix` { x, y, pitch, rows, cols, legend }. Rows are output
 * jacks, columns input jacks; (x, y) is the hole of the first row and column and `pitch` the spacing. A pin is a cable
 * from a row's jack to a column's jack, so everything that reads cables (the explainer, the sound map, lessons) works
 * unchanged. Click a hole to put a pin in or take it out; point at one to read what that pin does or would do.
 * The row and column legends are the jacks: pointing at one explains the jack. `legend` { row: [w, h], col: [w, h] }
 * sizes their hit boxes, centred on each jack.
 */
export function Matrix({ def, cables, ctx, faded, onConnect, onRemoveCable }) {
  const m = def.matrix;
  const [hov, setHov] = useState(null); // [row, col] under the pointer
  const lit = useStore(highlightStore);
  const focusId = useStore(focusStore, (f) => (f && f.kind === 'cable' ? f.id : null));
  const jm = Object.fromEntries(def.jacks.map((j) => [j.id, j]));
  const P = m.pitch;
  const hx = (j) => m.x + j * P, hy = (i) => m.y + i * P;
  const pinAt = {};
  cables.forEach((cb, k) => {
    const i = m.rows.indexOf(cb.from), j = m.cols.indexOf(cb.to);
    if (i >= 0 && j >= 0) pinAt[`${i},${j}`] = k;
  });
  const cell = (e) => {
    const svg = e.currentTarget.ownerSVGElement;
    const mt = svg && svg.getScreenCTM();
    if (!mt) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(mt.inverse());
    const j = Math.round((p.x - m.x) / P), i = Math.round((p.y - m.y) / P);
    return i >= 0 && i < m.rows.length && j >= 0 && j < m.cols.length ? [i, j] : null;
  };
  const focusPin = (e, i, j, sticky = false) => {
    const from = m.rows[i], to = m.cols[j];
    const pinned = pinAt[`${i},${j}`] != null;
    focusStore.set({ kind: 'cable', id: `${from}>${to}`, from, to, at: to, x: e.clientX, y: e.clientY, tip: true, sticky, pin: true, empty: !pinned && !sticky });
  };
  const hr = Math.max(2.5, P * 0.16);
  const holes = [];
  for (let i = 0; i < m.rows.length; i++) {
    for (let j = 0; j < m.cols.length; j++) {
      holes.push(<circle key={`${i},${j}`} cx={hx(j)} cy={hy(i)} r={hr} fill={ctx.outline ? PAPER : '#020203'} stroke={ctx.outline ? INK : '#3d3e42'} strokeWidth={ctx.outline ? 1.2 : 0.8} />);
    }
  }
  const pins = Object.entries(pinAt).map(([key, k]) => {
    const [i, j] = key.split(',').map(Number);
    const cb = cables[k];
    const id = `${cb.from}>${cb.to}`;
    const x = hx(j), y = hy(i), pr = P * 0.34;
    return (
      <g key={key} opacity={faded && faded(id) ? 0.35 : 1}>
        {focusId === id && <circle cx={x} cy={y} r={pr * 1.7} fill="none" stroke="#fff" strokeWidth="3" strokeOpacity="0.9" />}
        {ctx.outline ? (
          <g><circle cx={x} cy={y} r={pr} fill={INK} /><circle cx={x} cy={y} r={pr * 0.4} fill={PAPER} /></g>
        ) : (
          <g>
            <ellipse cx={x + pr * 0.45} cy={y + pr * 0.75} rx={pr * 1.05} ry={pr * 0.8} fill="#000" opacity="0.5" />
            <circle cx={x} cy={y} r={pr} fill="#f3f2ec" stroke="#8d8c86" strokeWidth="1" />
            <circle cx={x} cy={y} r={pr * 0.55} fill="#dddcd5" stroke="#b5b4ad" strokeWidth="0.8" />
            <circle cx={x - pr * 0.3} cy={y - pr * 0.35} r={pr * 0.25} fill="#fff" opacity="0.9" />
          </g>
        )}
      </g>
    );
  });
  // A lesson points at the row and column of each pin it adds: ring the holes where a lit row meets a lit column.
  const rings = [];
  m.rows.forEach((r, i) => {
    if (!lit.includes(r)) return;
    m.cols.forEach((cId, j) => { if (lit.includes(cId)) rings.push(<circle key={`h${i},${j}`} className="kys-pulse" cx={hx(j)} cy={hy(i)} r={P * 0.55} fill="none" stroke="#ff5d8f" strokeWidth="3.5" />); });
  });
  const legends = [...m.rows.map((id) => [id, m.legend.row]), ...m.cols.map((id) => [id, m.legend.col])].map(([id, [w, h]]) => {
    const j = jm[id];
    return <MatrixLegend key={id} j={j} w={w} h={h} on={lit.includes(id)} />;
  });
  const span = { x: m.x - P / 2, y: m.y - P / 2, w: m.cols.length * P, h: m.rows.length * P };
  return (
    <g>
      {holes}
      {legends}
      <g pointerEvents="none">{pins}{rings}</g>
      {hov && <circle cx={hx(hov[1])} cy={hy(hov[0])} r={P * 0.46} fill="none" stroke={ctx.outline ? INK : '#ffffff'} strokeWidth="2.5" pointerEvents="none" />}
      <rect x={span.x} y={span.y} width={span.w} height={span.h} fill="transparent" className="kys-hit" style={{ cursor: 'pointer' }}
        role="grid" aria-label="Pin matrix: rows are sources, columns are destinations"
        onPointerMove={(e) => {
          const c = cell(e);
          if (!c) { setHov(null); return; }
          if (!hov || hov[0] !== c[0] || hov[1] !== c[1]) { setHov(c); if (e.pointerType === 'mouse') focusPin(e, c[0], c[1]); }
        }}
        onPointerLeave={() => { setHov(null); focusStore.set((s) => (s && s.kind === 'cable' && !s.sticky ? (s.empty ? null : { ...s, tip: false }) : s)); }}
        onClick={(e) => {
          e.stopPropagation();
          const c = cell(e);
          if (!c) return;
          const k = pinAt[`${c[0]},${c[1]}`];
          if (k != null) { focusStore.set((s) => (s && s.id === `${m.rows[c[0]]}>${m.cols[c[1]]}` ? null : s)); onRemoveCable(k); }
          else { onConnect(m.rows[c[0]], m.cols[c[1]]); focusPin(e, c[0], c[1], true); }
        }} />
    </g>
  );
}

/** A matrix row or column legend: the hit box (and lesson highlight) for one of the matrix's jacks. */
function MatrixLegend({ j, w, h, on }) {
  const hover = useHover('jack', j.id);
  return (
    <g>
      {on && <rect className="kys-pulse" x={j.x - w / 2 - 3} y={j.y - h / 2 - 3} width={w + 6} height={h + 6} rx="5" fill="none" stroke="#ff5d8f" strokeWidth="3" pointerEvents="none" />}
      <rect x={j.x - w / 2} y={j.y - h / 2} width={w} height={h} fill="transparent" tabIndex={0} role="note"
        aria-label={`${j.name || j.label} ${j.dir === 'out' ? 'matrix row' : 'matrix column'}`} {...hover} />
    </g>
  );
}
