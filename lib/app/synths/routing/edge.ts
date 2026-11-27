/**
 * Behringer EDGE signal routing, projected from its spec (`.context/app/synth-data/edge/edge.synth.json`, 0.13.0) by the
 * builder it shares with the Moog DFAM it recreates (`routing/dfam-voice.ts`).
 */
import type { SynthRouting } from '@/lib/app/synths/contract';
import { dfamRouting } from '@/lib/app/synths/routing/dfam-voice';

export const routing: SynthRouting = dfamRouting('edge');
