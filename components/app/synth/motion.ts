/**
 * Whether the panel shows a new patch being set, a part at a time (`use-panel-history.ts`): not with reduced motion.
 * Its own module so the unit tests can turn glides off by default (`tests/setup.ts`), the panel then set at once as a
 * test expects, and on again in the tests of the glides themselves.
 */
export const glideMotion = (): boolean =>
  !(
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
