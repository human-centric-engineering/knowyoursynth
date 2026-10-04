// Behringer System 35 — SynthDef. A recreation of the 1973 Moog System 35: twenty-five 900-series modules in two rows,
// nothing wired between them. Coordinates follow Behringer's front photo (14 units per HP), shifted up 50 units.
import { annotate } from '@/lib/maps.js';
import { createRack, rackEngine, blank, appOut, HP, m914, m923, m904b, m904a, m902, m911, m921a, m921b, m921, cp3am, cp35, m961, cm1a, cp3ao, m992 } from '@/synths/moog900/modules.js';
import sounds from '@/synths/sounds/system-35.js';
import lineage from '@/synths/lineage/system-35.js';
import unusual from '@/synths/unusual/system-35.js';
import { forRack } from '@/synths/moog900/unusual.js';

const X = (hp) => 20 + hp * HP;
const TOP = 22, BOT = 386;
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
  { t: 'rect', x: 12, y: 742, w: 1976, h: 54, r: 6, fill: '#121213', hw: true },
);
decor.push({ t: 'text', x: 1000, y: 782, text: 'behringer', size: 30, anchor: 'middle', weight: 500, hw: true });
annotate(forRack(rack, unusual), controls, jacks, areas);

const init = Object.fromEntries(controls.map((c) => [c.id, c.def]));

function toEngine(v) {
  return {
    moog: rackEngine(rack, v),
    osc: [],
    noise: { level: 0, color: 'white' },
    ext: { level: 0 },
    filter: { type: 'ladder', mode: 'lp', cutoff: 1000, res: 0, envAmt: 0, envSrc: 'env1', kbd: 0 },
    env1: { a: 0.01, d: 0.1, s: 1, r: 0.1 },
    env2: { a: 0.01, d: 0.1, s: 1, r: 0.1 },
    vca: { envSrc: 'none', bias: 0 },
    lfo: { rate: 1, mix: {}, keySync: false },
    glide: { time: 0, legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    volume: 0.8,
  };
}

export default {
  id: 'system-35', name: 'System 35', maker: 'Behringer', year: 2022,
  heritage: 'Based on the 1973 Moog System 35 modular',
  summary: 'Twenty-five 900-series modules with nothing wired between them: two 921A drivers with four 921B oscillators, a 921, the 904A, 904B, 914 and 923 filters, the 992 and two CP3A-O control switchers, two CP3A-M mixers, three 911 envelopes and three 902 amplifiers. Every sound starts with a cable.',
  view: { w: 2000, h: 800 },
  theme: { panel: '#0e0e0f', panel2: '#070708', ink: '#dcdcd8', font: 'din', cheeks: 'none', cheekW: 0, weight: 600 },
  silentInit: 'Nothing on a modular is connected until you patch it, so with no cables the System 35 is silent.',
  signalNames: rack.signalNames, destNames: rack.destNames,
  decor, areas, controls, jacks, init, toEngine, presets: sounds, lineage,
};
