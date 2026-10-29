/**
 * The routing registry: every synth's signal routing, by synth id. A synth without one has no routing view yet.
 *
 * A routing joins by adding its module under `routing/` and one line below (`.context/app/synths.md`).
 * `tests/unit/lib/app/synths/routing.test.ts` checks every one listed here against its definition and its spec.
 */
import type { SynthRouting } from '@/lib/app/synths/contract';
import { routing as modelD } from '@/lib/app/synths/routing/model-d';
import { routing as neutron } from '@/lib/app/synths/routing/neutron';
import { routing as pro1 } from '@/lib/app/synths/routing/pro-1';

export const SYNTH_ROUTINGS: SynthRouting[] = [modelD, neutron, pro1];

const BY_ID = new Map(SYNTH_ROUTINGS.map((r) => [r.synth, r]));

export const getSynthRouting = (id: string): SynthRouting | undefined => BY_ID.get(id);
