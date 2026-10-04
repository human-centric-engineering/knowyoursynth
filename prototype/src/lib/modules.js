// Colour coding for the parts of a synth voice. Used by lesson steps, chips and panel highlights.
export const MODULES = {
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
export const moduleOf = (m) => MODULES[m] || MODULES.util;

export const CABLE_COLORS = ['#ffb020', '#38c6ff', '#ff5d8f', '#7ed267', '#c59bff', '#ff7d54', '#f4f1e8'];
