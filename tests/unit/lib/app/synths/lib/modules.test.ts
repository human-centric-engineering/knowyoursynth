/**
 * Module colour table tests
 *
 * @see lib/app/synths/lib/modules.ts
 */
import { describe, expect, it } from 'vitest';
import { CABLE_COLORS, MODULES, moduleOf } from '@/lib/app/synths/lib/modules';
import { SYNTH_MODULES } from '@/lib/app/synths/contract';

describe('modules', () => {
  it('has a label and a colour for every synth module', () => {
    for (const m of SYNTH_MODULES) {
      expect(MODULES[m].label).toBeTruthy();
      expect(MODULES[m].color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('moduleOf finds a module by name and falls back to Utilities', () => {
    expect(moduleOf('filter')).toEqual({ label: 'Filter', color: '#35c4b0' });
    expect(moduleOf('nonsense')).toBe(MODULES.util);
    expect(moduleOf(undefined)).toBe(MODULES.util);
  });

  it('has seven distinct cable colours', () => {
    expect(new Set(CABLE_COLORS).size).toBe(7);
  });
});
