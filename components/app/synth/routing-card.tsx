'use client';

/**
 * A block's card on the routing view (`f-routing-view` t-143): what the part is, its specs, whether the patch uses
 * it now, and the panel controls and jacks that set it. Choosing a control or a jack hands it to `onShow`, which turns
 * the panel face up again with it found, so the diagram and the panel stay one instrument.
 *
 * Only the card's face: `RoutingView` opens it by a block, on hover, keyboard focus or a tap, and places it.
 */

import { moduleOf } from '@/lib/app/synths/lib/modules';
import { jackName } from '@/lib/app/synths/lib/explain';
import { controlMap, displayName, jackMap } from '@/lib/app/synths/lib/patch';
import type { RoutingBlock, SynthDef, SynthRouting } from '@/lib/app/synths/contract';

/** A control or a jack to find on the panel. */
export interface RoutingShowTarget {
  kind: 'control' | 'jack';
  id: string;
}

export function RoutingCard({
  def,
  routing,
  block,
  tag,
  live,
  onShow,
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
}) {
  const controls = controlMap(def);
  const jacks = jackMap(def);
  const setBy = (block.controls ?? []).flatMap((id) => controls[id] ?? []);
  const plugs = Object.entries(routing.jacks).flatMap(([id, b]) =>
    b === block.id && jacks[id] ? [jacks[id]] : []
  );
  const item = (kind: RoutingShowTarget['kind'], id: string, name: string, note?: string) => (
    <li key={id}>
      {onShow ? (
        <button
          type="button"
          className="kys-routing-card-item"
          title="Show it on the panel"
          onClick={() => onShow({ kind, id })}
        >
          {name}
          {note && <span className="kys-routing-card-note">{note}</span>}
        </button>
      ) : (
        <span className="kys-routing-card-item">
          {name}
          {note && <span className="kys-routing-card-note">{note}</span>}
        </span>
      )}
    </li>
  );

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
