/**
 * Behringer System 15: the definition (D1). A recreation of the 1973 Moog System 15 in Eurorack: sixteen 900-series
 * modules in two rows, nothing wired between them. Coordinates follow Behringer's front photo (14 units per HP),
 * shifted up 50 units. The modules are built by `defs/moog900/modules.ts`, which the System 35 and 55 share.
 *
 * It opens compact (`f-compact-panels` t-232): the hardware's BP56 and BP28 blank panels left out, the 921 VCO moved
 * up to close the top row, and the rest of the bottom row closed up, two 98 HP rows in place of 140. The hardware's
 * case, blanks and all, is the Layout setting's Full.
 *
 * Transliterated from the prototype file `src/synths/system-15.js` (D3), the way `defs/model-d.ts` was: no content
 * (sounds, lineage, unusual notes), a `version`, and the Behringer wordmarks tagged `brand`.
 */
import type { SynthDef } from '@/lib/app/synths/contract';
import {
  HP,
  ROW_H,
  SYSTEM_THEME,
  appOut,
  blank,
  caseWordmark,
  cm1a,
  cp35,
  cp3am,
  createRack,
  initOf,
  MOOG900_DEFAULT_PATCH,
  m902,
  m904a,
  m904b,
  m911,
  m914,
  m921,
  m921a,
  m921b,
  m923,
  m961,
  rackToEngine,
} from '@/lib/app/synths/defs/moog900/modules';

const X = (hp: number): number => 20 + hp * HP;
const TOP = 22,
  BOT = 386;
const rack = createRack();

// ── Top row: 914 · 923 · 904B · 904A · 902 · 902 · 911 · 911 · BP56 ──
m914(rack, X(0), TOP);
m923(rack, X(28), TOP);
m904b(rack, X(36), TOP);
m904a(rack, X(44), TOP);
m902(rack, X(52), TOP, 1);
m902(rack, X(60), TOP, 2);
m911(rack, X(68), TOP, 1);
m911(rack, X(76), TOP, 2);
blank(rack, X(84), TOP, 56, 'BP56');
// ── Bottom row: 921A · 921B · 921B · 921 · CP3A-M · CP35 · 961 · BP28 · BP12 (the app's output) · CM1A ──
m921a(rack, X(0), BOT, 1);
m921b(rack, X(8), BOT, 1);
m921b(rack, X(16), BOT, 2);
m921(rack, X(24), BOT);
cp3am(rack, X(38), BOT, 1);
cp35(rack, X(52), BOT);
m961(rack, X(73), BOT);
blank(rack, X(94), BOT, 28, 'BP28');
appOut(rack, X(122), BOT, 12, 'BP12');
cm1a(rack, X(134), BOT);

const { controls, jacks, decor, areas } = rack;
const ROW = 385; // where the top row's cut ends: its modules and the rail under them
const RAIL = 9; // the rail between the rows, the last of the top row's cut
const STRIP = 742; // the maker's strip under the bottom row
const EDGE = 12; // the case's edge either side of the rail and the strip
const W = X(98) + 20; // the compact case: two 98 HP rows
// the case: a rail between the rows and the maker's strip under them
decor.unshift(
  { t: 'rect', x: 0, y: 0, w: 2000, h: 800, r: 10, fill: '#0b0b0c', hw: true },
  {
    t: 'rect',
    x: EDGE,
    y: ROW - RAIL,
    w: 2000 - EDGE * 2,
    h: RAIL,
    r: 2,
    fill: '#050505',
    hw: true,
  },
  { t: 'rect', x: EDGE, y: STRIP, w: 2000 - EDGE * 2, h: 54, r: 6, fill: '#121213', hw: true }
);
decor.push(caseWordmark(1000, 782));

const system15: SynthDef & { version: number } = {
  id: 'system-15',
  version: 1,
  name: 'System 15',
  maker: 'Behringer',
  year: 2022,
  heritage: 'Based on the 1973 Moog System 15 modular',
  summary:
    'Sixteen 900-series modules with nothing wired between them: two 921B oscillators under a 921A driver, a 921 LFO, the 904A ladder and 904B high-pass, the 914 fixed filter bank, two 902 amplifiers and two 911 envelopes. Every sound starts with a cable.',
  view: { w: 2000, h: 800 },
  theme: SYSTEM_THEME,
  silentInit:
    'Nothing on a modular is connected until you patch it, so with no cables the System 15 is silent.',
  signalNames: rack.signalNames,
  destNames: rack.destNames,
  decor,
  areas,
  controls,
  jacks,
  init: initOf(controls),
  defaultPatch: MOOG900_DEFAULT_PATCH,
  compact: {
    pieces: [
      // top row: 914 to the second 911, the case's left edge and the rail under them
      { cut: [0, 0, X(84), ROW], at: [0, 0] },
      // then the 921 from the bottom row where BP56 was, with the case above it and the rail under it, cut from over
      // and under BP56, and the case's right edge
      { cut: [X(84), 0, X(98), TOP], at: [X(84), 0] },
      { cut: [X(24), BOT, X(38), BOT + ROW_H], at: [X(84), TOP] },
      { cut: [X(84), TOP + ROW_H, X(98), ROW], at: [X(84), TOP + ROW_H] },
      { cut: [2000 - 20, 0, 2000, ROW], at: [X(98), 0] },
      // bottom row: 921A and the 921Bs, CP3A-M to 961, then BP12 (the app's output), CM1A and the case's edge
      { cut: [0, ROW, X(24), STRIP], at: [0, ROW] },
      { cut: [X(38), ROW, X(94), STRIP], at: [X(24), ROW] },
      { cut: [X(122), ROW, 2000, STRIP], at: [X(80), ROW] },
      // the maker's strip: its middle, cut so the wordmark (at 1000) stays in the middle, between the case's edges
      { cut: [0, STRIP, EDGE, 800], at: [0, STRIP] },
      { cut: [1000 - W / 2 + EDGE, STRIP, 1000 + W / 2 - EDGE, 800], at: [EDGE, STRIP] },
      { cut: [2000 - EDGE, STRIP, 2000, 800], at: [W - EDGE, STRIP] },
    ],
  },
  toEngine: (v) => rackToEngine(rack, v),
};

export default system15;
