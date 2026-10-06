// Colour coding for the parts of a synth voice. Used by lesson steps, chips and panel highlights.
//
// Transliterated from `prototype/src/lib/modules.js` (decision D3).
import type { SynthModule } from '@/lib/app/synths/contract';

export interface ModuleInfo {
  label: string;
  color: string;
}

export const MODULES: Record<SynthModule, ModuleInfo> = {
  osc: { label: 'Oscillators', color: '#f6a63a' },
  mixer: { label: 'Mixer', color: '#e6cf52' },
  filter: { label: 'Filter', color: '#35c4b0' },
  env: { label: 'Envelopes', color: '#ef6f9f' },
  amp: { label: 'Amplifier', color: '#7ed267' },
  mod: { label: 'Modulation', color: '#a48bff' },
  lfo: { label: 'LFO', color: '#a48bff' },
  glide: { label: 'Glide', color: '#6fb6ff' },
  mode: { label: 'Mode', color: '#6fb6ff' },
  util: { label: 'Utilities', color: '#9aa7bd' },
  fx: { label: 'Effects', color: '#ff7d54' },
  out: { label: 'Output', color: '#9aa7bd' },
  patch: { label: 'Patch cables', color: '#ff5d8f' },
};

/** The same table, read by any string (an unknown module falls back to `util`). */
const BY_NAME: Record<string, ModuleInfo | undefined> = MODULES;

export const moduleOf = (m: string | null | undefined): ModuleInfo =>
  (m != null && BY_NAME[m]) || MODULES.util;

export const CABLE_COLORS = [
  '#ffb020',
  '#38c6ff',
  '#ff5d8f',
  '#7ed267',
  '#c59bff',
  '#ff7d54',
  '#f4f1e8',
];
