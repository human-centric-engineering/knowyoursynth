// Small typing and panel-reading helpers every SynthDef file shares.
import type { ControlValues } from '@/lib/app/synths/contract';

/** `Omit` over each member of a union, so a discriminated control or jack keeps its variants. */
export type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A panel value as a number. A continuous control always holds one. */
export const num = (v: ControlValues, id: string): number => Number(v[id]);
