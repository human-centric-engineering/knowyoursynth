'use client';

/**
 * The sequencer's chassis from `lg` up (t-281): a rack unit bolted in under the synth's panel, as if the two shared
 * one rack. Ears with their screws either side, a faceplate with the unit's name engraved along its top and a power
 * switch that puts the module away (the bar's Sequencer button brings it back). The module's help is on the faceplate
 * too, by the Run lamp, rather than in its tool row (t-282). Below `lg` the sequencer is a bottom
 * sheet and has no chassis.
 *
 * Drawn in CSS only (`.kys-rack` in `synth.css`). No `transform` on it: the module's tooltips are positioned `fixed`.
 */

import type { ReactNode, Ref } from 'react';
import { Power } from 'lucide-react';
import { PlayerTip } from '@/components/app/synth/player-tip';
import { SequencerHelp } from '@/components/app/sequencer/sequencer';

/** One rack ear: two screws, top and bottom, with an engraving between them. */
function Ear({ side, engraving }: { side: 'left' | 'right'; engraving: string }) {
  return (
    <div className={`kys-rack-ear is-${side}`} aria-hidden="true">
      <span className="kys-rack-screw" />
      <span className="kys-rack-ear-text">{engraving}</span>
      <span className="kys-rack-screw" />
    </div>
  );
}

export function SequencerRack({
  ref,
  running,
  onPower,
  away = false,
  children,
}: {
  ref?: Ref<HTMLDivElement>;
  /** The pattern is playing: the run lamp on the faceplate is lit. */
  running: boolean;
  /** The power switch: puts the module away. */
  onPower: () => void;
  /** Hidden, with what is in it kept as it is: under an unmodelled family member's blank panel (t-321). */
  away?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      ref={ref}
      className="kys-rack"
      data-running={running || undefined}
      style={away ? { display: 'none' } : undefined}
    >
      <Ear side="left" engraving="KYS" />
      <div className="kys-rack-face">
        <div className="kys-rack-plate">
          <span className="kys-rack-model" aria-hidden="true">
            SQ<span className="kys-rack-model-dot">·</span>16
          </span>
          <span className="kys-rack-name" aria-hidden="true">
            Step sequencer
          </span>
          <span className="kys-rack-groove" aria-hidden="true" />
          <span className="kys-rack-help">
            <SequencerHelp />
          </span>
          <span className="kys-rack-run" aria-hidden="true">
            <span className="kys-rack-run-led" />
            Run
          </span>
          <span className="kys-rack-vents" aria-hidden="true" />
          <PlayerTip
            name="Put the sequencer away"
            help="Hides the module. The pattern stays as it is, and plays on if it is playing. Sequencer on the bar brings it back."
          >
            <button
              type="button"
              className="kys-rack-power"
              aria-label="Put the sequencer away"
              onClick={onPower}
            >
              <span className="kys-rack-power-led" aria-hidden="true" />
              <Power size={13} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </PlayerTip>
        </div>
        {children}
      </div>
      <Ear side="right" engraving="SQ-16" />
    </div>
  );
}
