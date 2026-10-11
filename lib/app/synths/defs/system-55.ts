/**
 * Behringer System 55: the definition (D1). A recreation of the 1973 Moog System 55: thirty-eight 900-series modules
 * in three rows, with the 960 sequencer, and nothing wired between them. Laid out from Behringer's front photo at 14
 * units per HP. The modules are built by `defs/moog900/modules.ts`, which the System 15 and 35 share.
 *
 * Transliterated from the prototype file `src/synths/system-55.js` (D3), the way `defs/model-d.ts` was: no content
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
  cp3ao,
  createRack,
  initOf,
  m902,
  m903a,
  m904a,
  m904b,
  m911,
  m911a,
  m914,
  m921,
  m921a,
  m921b,
  m923,
  m960,
  m961,
  m962,
  m992,
  m995,
  rackToEngine,
} from '@/lib/app/synths/defs/moog900/modules';

const X = (hp: number): number => 20 + hp * HP;
const TOP = 22,
  MID = 22 + ROW_H + 11,
  BOT = 22 + 2 * (ROW_H + 11);
const W = 40 + 148 * HP;
const rack = createRack();

// ── Top row: 914 · 923 · 904B · 904A · 992 · 902 · 902 · 911 · 911 · 902 · 902 · 902 · 911A · 911 · 911 ──
m914(rack, X(0), TOP);
m923(rack, X(28), TOP);
m904b(rack, X(36), TOP);
m904a(rack, X(44), TOP);
m992(rack, X(52), TOP);
m902(rack, X(60), TOP, 1);
m902(rack, X(68), TOP, 2);
m911(rack, X(76), TOP, 1);
m911(rack, X(84), TOP, 2);
m902(rack, X(92), TOP, 3);
m902(rack, X(100), TOP, 4);
m902(rack, X(108), TOP, 5);
m911a(rack, X(116), TOP);
m911(rack, X(124), TOP, 3);
m911(rack, X(132), TOP, 4);
// ── Middle row: 921A · 921B ×3 · 921A · 921B ×3 · 921 · 960 · CM1A ──
m921a(rack, X(0), MID, 1);
m921b(rack, X(8), MID, 1);
m921b(rack, X(16), MID, 2);
m921b(rack, X(24), MID, 3);
m921a(rack, X(32), MID, 2);
m921b(rack, X(40), MID, 4);
m921b(rack, X(48), MID, 5);
m921b(rack, X(56), MID, 6);
m921(rack, X(64), MID);
m960(rack, X(78), MID, 64);
cm1a(rack, X(142), MID);
// ── Bottom row: CP3A-O · CP3A-M · BP2 · 995 · CP3A-O · CP3A-M · BP2 · 995 · CP3A-O · CP3A-M · 903A · CP35 · 961 · 962 · the app's output ──
cp3ao(rack, X(0), BOT, 1);
cp3am(rack, X(8), BOT, 1);
blank(rack, X(22), BOT, 2, 'BP2');
m995(rack, X(24), BOT, 1);
cp3ao(rack, X(32), BOT, 2);
cp3am(rack, X(40), BOT, 2);
blank(rack, X(54), BOT, 2, 'BP2');
m995(rack, X(56), BOT, 2);
cp3ao(rack, X(64), BOT, 3);
cp3am(rack, X(72), BOT, 3);
m903a(rack, X(86), BOT);
cp35(rack, X(90), BOT);
m961(rack, X(111), BOT);
m962(rack, X(132), BOT);
appOut(rack, X(140), BOT, 8, 'BP8');

const { controls, jacks, decor, areas } = rack;
const H = BOT + ROW_H + 64;
decor.unshift(
  { t: 'rect', x: 0, y: 0, w: W, h: H, r: 10, fill: '#0b0b0c', hw: true },
  { t: 'rect', x: 12, y: MID - 10, w: W - 24, h: 9, r: 2, fill: '#050505', hw: true },
  { t: 'rect', x: 12, y: BOT - 10, w: W - 24, h: 9, r: 2, fill: '#050505', hw: true },
  { t: 'rect', x: 12, y: BOT + ROW_H + 6, w: W - 24, h: 54, r: 6, fill: '#121213', hw: true }
);
decor.push(caseWordmark(W / 2, BOT + ROW_H + 46));

const system55: SynthDef & { version: number } = {
  id: 'system-55',
  version: 1,
  name: 'System 55',
  maker: 'Behringer',
  year: 2022,
  heritage: 'Based on the 1973 Moog System 55 modular',
  summary:
    'Thirty-eight 900-series modules in three rows, nothing wired between them: two 921A drivers with six 921B oscillators, a 921, the 960 sequencer and 962 sequential switch, the 904A, 904B, 914 and 923 filters, five 902 amplifiers, four 911 envelopes and the 911A trigger delay, three mixers, three CP3A-O and the 992 control switchers, and five sets of attenuators.',
  view: { w: W, h: H },
  theme: SYSTEM_THEME,
  silentInit:
    'Nothing on a modular is connected until you patch it, so with no cables the System 55 is silent.',
  signalNames: rack.signalNames,
  destNames: rack.destNames,
  decor,
  areas,
  controls,
  jacks,
  init: initOf(controls),
  toEngine: (v) => rackToEngine(rack, v),
};

export default system55;
