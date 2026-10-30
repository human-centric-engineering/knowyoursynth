'use client';

/**
 * A block's card on the routing view (`f-routing-view` t-143): what the part is, its specs, whether the patch uses
 * it now, and the panel controls and jacks that set it. Choosing a control or a jack hands it to `onShow`, which turns
 * the panel face up again with it found, so the diagram and the panel stay one instrument.
 *
 * Above them, a picture of where they sit (t-147): a crop of the panel itself, the one under the routing view, reused
 * through `<use>` so it shows the patch's current settings, cables and design without drawing the panel again. The
 * block's controls and jacks are ringed in its module's colour and the rest of the crop is dimmed. A block spread
 * wider than a crop reads is drawn as one crop per cluster, all at one scale (`panelCrops`).
 *
 * Only the card's face: `RoutingView` opens it by a block, on hover, keyboard focus or a tap, and places it.
 */

import { useId, useMemo } from 'react';
import { PANEL_ALL_ID } from '@/components/app/panel/synth-panel';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { jackName } from '@/lib/app/synths/lib/explain';
import { controlMap, displayName, jackMap } from '@/lib/app/synths/lib/patch';
import { panelCrops, type PanelCrop, type PanelSpot } from '@/lib/app/synths/lib/routing';
import type { RoutingBlock, SynthDef, SynthRouting } from '@/lib/app/synths/contract';

/** A control or a jack to find on the panel. */
export interface RoutingShowTarget {
  kind: 'control' | 'jack';
  id: string;
}

/** The picture's height at most, in px: the crops are laid out in a row at one scale, no taller than this. */
const CROP_PX_H = 220;

/** One crop: the panel through `<use>`, dimmed outside its spots, each spot ringed in the card's colour. */
function Crop({ crop }: { crop: PanelCrop }) {
  const { x, y, w, h, spots } = crop;
  const maskId = useId();
  const box = (s: PanelSpot) => ({
    x: s.x - s.lit.w / 2,
    y: s.y - s.lit.h / 2,
    width: s.lit.w,
    height: s.lit.h,
    rx: Math.min(s.lit.w, s.lit.h) / 2,
  });
  return (
    <svg
      viewBox={`${x} ${y} ${w} ${h}`}
      className="kys-routing-card-crop"
      style={{ flexGrow: w, aspectRatio: `${w} / ${h}` }}
      data-testid="routing-card-crop"
    >
      <use href={`#${PANEL_ALL_ID}`} />
      <mask id={maskId} maskUnits="userSpaceOnUse" x={x} y={y} width={w} height={h}>
        <rect x={x} y={y} width={w} height={h} fill="#fff" />
        {spots.map((s) => (
          <rect key={`${s.kind}:${s.id}`} {...box(s)} fill="#000" />
        ))}
      </mask>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="#05060a"
        opacity="0.5"
        mask={`url(#${maskId})`}
      />
      {spots.map((s) => (
        <rect
          key={`${s.kind}:${s.id}`}
          {...box(s)}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          data-spot={`${s.kind}:${s.id}`}
        />
      ))}
    </svg>
  );
}

export function RoutingCard({
  def,
  routing,
  block,
  tag,
  live,
  onShow,
  panel,
}: {
  def: SynthDef;
  routing: SynthRouting;
  block: RoutingBlock;
  /** The designator its box carries (VCO, VCF, EG). */
  tag: string;
  /** Whether the patch routes through it now (`routingState()`). */
  live: boolean;
  /** Finds a control or jack on the panel. Absent: they are listed, but not offered. */
  onShow?: (target: RoutingShowTarget) => void;
  /** The definition as the panel draws it (a modular's case), whose faceplate is on the page. Absent: no picture. */
  panel?: SynthDef;
}) {
  const crops = useMemo(
    () => (panel ? panelCrops(panel, routing, block) : []),
    [panel, routing, block]
  );
  // At one scale, the row of crops is no wider than its tallest drawn CROP_PX_H high.
  const cropsW = crops.reduce((t, k) => t + k.w, 0);
  const cropsH = Math.max(0, ...crops.map((k) => k.h));
  const controls = controlMap(def);
  const jacks = jackMap(def);
  const setBy = (block.controls ?? []).flatMap((id) => controls[id] ?? []);
  const plugs = Object.entries(routing.jacks).flatMap(([id, b]) =>
    b === block.id && jacks[id] ? [jacks[id]] : []
  );
  const item = (kind: RoutingShowTarget['kind'], id: string, name: string, note?: string) => {
    const label = (
      <>
        {name}
        {note && <span className="kys-routing-card-note">{note}</span>}
      </>
    );
    return (
      <li key={id}>
        {onShow ? (
          <button
            type="button"
            className="kys-routing-card-item"
            title="Show it on the panel"
            onClick={() => onShow({ kind, id })}
          >
            {label}
          </button>
        ) : (
          <span className="kys-routing-card-item">{label}</span>
        )}
      </li>
    );
  };

  return (
    <div className="kys-routing-card-body" style={{ color: moduleOf(block.module).color }}>
      <p className="kys-routing-card-head">
        <span className="kys-routing-card-lamp" aria-hidden="true" />
        <span className="kys-routing-card-tag">{tag}</span>
        <span className="kys-routing-card-name">{block.name}</span>
      </p>
      <p className={`kys-routing-card-state ${live ? 'is-live' : ''}`}>
        {live ? 'On the path the patch uses now' : 'Not on the path the patch uses now'}
      </p>
      <p className="kys-routing-card-desc">{block.description}</p>
      {block.specs && block.specs.length > 0 && (
        <dl className="kys-routing-card-specs">
          {block.specs.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {crops.length > 0 && (
        <div
          role="img"
          aria-label={`Where the ${block.name} sits on the panel, its controls and jacks lit`}
          className="kys-routing-card-panel"
          style={{ maxWidth: `${(CROP_PX_H * cropsW) / cropsH}px` }}
        >
          {crops.map((k) => (
            <Crop key={`${k.x},${k.y}`} crop={k} />
          ))}
        </div>
      )}
      {setBy.length > 0 && (
        <section aria-label="Set by these controls">
          <h3 className="kys-routing-card-sub">Set by</h3>
          <ul className="kys-routing-card-list">
            {setBy.map((c) => item('control', c.id, displayName(def, c)))}
          </ul>
        </section>
      )}
      {plugs.length > 0 && (
        <section aria-label="Its jacks">
          <h3 className="kys-routing-card-sub">Jacks</h3>
          <ul className="kys-routing-card-list">
            {plugs.map((j) => item('jack', j.id, jackName(j), j.dir === 'in' ? 'in' : 'out'))}
          </ul>
        </section>
      )}
      {setBy.length === 0 && plugs.length === 0 && (
        <p className="kys-routing-card-none">Nothing on the panel sets it.</p>
      )}
      {onShow && (setBy.length > 0 || plugs.length > 0) && (
        <p className="kys-routing-card-hint">Choose one to see it on the panel.</p>
      )}
    </div>
  );
}
