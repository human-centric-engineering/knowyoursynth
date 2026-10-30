'use client';

/**
 * What the engine reports, as the live views read it once a frame: the routing view on the back of the panel and the
 * live glow on its face (`f-live-panel`). The meters come from `meterStore`; the output's level is read off the
 * engine's analyser, as the scope does.
 */

import {
  levelOfRms,
  SILENT,
  steadyMeters,
  type ActivityMeters,
} from '@/lib/app/synths/lib/routing-activity';
import { meterStore } from '@/components/app/synth/stores';

/** What a live view reads the output's level from: the engine's analyser. */
export interface LiveSource {
  analyser: Pick<AnalyserNode, 'fftSize' | 'getFloatTimeDomainData'> | null;
}

/** The output's RMS, from `samples` read off the analyser. */
function rmsOf(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / (samples.length || 1));
}

/**
 * A reader for one view's frame loop: each call gives the meters now, `SILENT` while the power is off. It keeps its
 * own sample buffer, so a frame allocates nothing. `steady` = the visitor asks for less motion (`steadyMeters()`).
 */
export function createMeterReader(): (
  source: LiveSource | null | undefined,
  steady: boolean
) => ActivityMeters {
  let samples: Float32Array<ArrayBuffer> | null = null;
  return (source, steady) => {
    const m = meterStore.get();
    if (!m.power) return SILENT;
    const an = source?.analyser;
    let out = 0;
    if (an) {
      if (samples?.length !== an.fftSize) samples = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(samples);
      out = levelOfRms(rmsOf(samples));
    }
    const meters: ActivityMeters = {
      gate: m.gate,
      env1: m.env1 ?? 0,
      env2: m.env2 ?? 0,
      lfo: m.lfo,
      lfoHz: m.lfoHz ?? 0,
      osc: (m.oscV ?? []).map((v, k) => ({ v, hz: m.oscHz?.[k] ?? 0, lv: m.oscLv?.[k] ?? 0 })),
      out,
      moog: m.moog,
    };
    return steady ? steadyMeters(meters) : meters;
  };
}
