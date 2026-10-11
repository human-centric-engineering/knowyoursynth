/**
 * Behringer System 35: the definition (D1). A recreation of the 1973 Moog System 35: twenty-five 900-series modules
 * in two rows, nothing wired between them. Coordinates follow Behringer's front photo (14 units per HP), shifted up
 * 50 units. The modules are built by `defs/moog900/modules.ts`, which the System 15 and 55 share.
 *
 * Transliterated from the prototype file `src/synths/system-35.js` (D3), the way `defs/model-d.ts` was: no content
 * (sounds, lineage, unusual notes), a `version`, and the Behringer wordmarks tagged `brand`.
 */
import type { SynthDef } from '@/lib/app/synths/contract';
import {
  HP,
  SYSTEM_THEME,
  appOut,
  blank,
  caseWordmark,
  cm1a,
  cp35,
  cp3am,
  cp3ao,
  createRack,
  initOf,
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
  m992,
  rackToEngine,
} from '@/lib/app/synths/defs/moog900/modules';

const X = (hp: number): number => 20 + hp * HP;
const TOP = 22,
  BOT = 386;
const rack = createRack();

// ── Top row: 921A · 921B · 921B · 921A · 921B · 921B · 921 · 914 · 923 · 904B · 904A · 992 · BP12 (the app's output) · CM1A ──
m921a(rack, X(0), TOP, 1);
m921b(rack, X(8), TOP, 1);
m921b(rack, X(16), TOP, 2);
m921a(rack, X(24), TOP, 2);
m921b(rack, X(32), TOP, 3);
m921b(rack, X(40), TOP, 4);
m921(rack, X(48), TOP);
m914(rack, X(62), TOP);
m923(rack, X(90), TOP);
m904b(rack, X(98), TOP);
m904a(rack, X(106), TOP);
m992(rack, X(114), TOP);
appOut(rack, X(122), TOP, 12, 'BP12');
cm1a(rack, X(134), TOP);
// ── Bottom row: CP3A-O · CP3A-M · BP2 · CP3A-O · CP3A-M · BP2 · CP35 · 961 · 911 ×3 · 902 ×3 · BP2 ──
cp3ao(rack, X(0), BOT, 1);
cp3am(rack, X(8), BOT, 1);
blank(rack, X(22), BOT, 2, 'BP2');
cp3ao(rack, X(24), BOT, 2);
cp3am(rack, X(32), BOT, 2);
blank(rack, X(46), BOT, 2, 'BP2');
cp35(rack, X(48), BOT);
m961(rack, X(69), BOT);
m911(rack, X(90), BOT, 1);
m911(rack, X(98), BOT, 2);
m911(rack, X(106), BOT, 3);
m902(rack, X(114), BOT, 1);
m902(rack, X(122), BOT, 2);
m902(rack, X(130), BOT, 3);
blank(rack, X(138), BOT, 2, 'BP2');

const { controls, jacks, decor, areas } = rack;
decor.unshift(
  { t: 'rect', x: 0, y: 0, w: 2000, h: 800, r: 10, fill: '#0b0b0c', hw: true },
  { t: 'rect', x: 12, y: 376, w: 1976, h: 9, r: 2, fill: '#050505', hw: true },
  { t: 'rect', x: 12, y: 742, w: 1976, h: 54, r: 6, fill: '#121213', hw: true }
);
decor.push(caseWordmark(1000, 782));

const system35: SynthDef & { version: number } = {
  id: 'system-35',
  version: 1,
  name: 'System 35',
  maker: 'Behringer',
  year: 2022,
  heritage: 'Based on the 1973 Moog System 35 modular',
  summary:
    'Twenty-five 900-series modules with nothing wired between them: two 921A drivers with four 921B oscillators, a 921, the 904A, 904B, 914 and 923 filters, the 992 and two CP3A-O control switchers, two CP3A-M mixers, three 911 envelopes and three 902 amplifiers. Every sound starts with a cable.',
  view: { w: 2000, h: 800 },
  theme: SYSTEM_THEME,
  silentInit:
    'Nothing on a modular is connected until you patch it, so with no cables the System 35 is silent.',
  signalNames: rack.signalNames,
  destNames: rack.destNames,
  decor,
  areas,
  controls,
  jacks,
  init: initOf(controls),
  toEngine: (v) => rackToEngine(rack, v),
};

export default system35;
