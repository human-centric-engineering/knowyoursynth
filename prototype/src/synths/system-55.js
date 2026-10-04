// Behringer System 55 — SynthDef. A recreation of the 1973 Moog System 55: thirty-eight 900-series modules in three
// rows, with the 960 sequencer, and nothing wired between them. Laid out from Behringer's front photo at 14 units per HP.
import { annotate } from '@/lib/maps.js';
import { createRack, rackEngine, blank, appOut, HP, ROW_H, m914, m923, m904b, m904a, m902, m911, m921a, m921b, m921, cp3am, cp35, m961, cm1a, cp3ao, m992,
  m960, m962, m911a, m995, m903a } from '@/synths/moog900/modules.js';
import sounds from '@/synths/sounds/system-55.js';
import lineage from '@/synths/lineage/system-55.js';
import unusual from '@/synths/unusual/system-55.js';
import { forRack } from '@/synths/moog900/unusual.js';

const X = (hp) => 20 + hp * HP;
const ROWS = [22, 22 + ROW_H + 11, 22 + 2 * (ROW_H + 11)];
const [TOP, MID, BOT] = ROWS;
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
  { t: 'rect', x: 12, y: BOT + ROW_H + 6, w: W - 24, h: 54, r: 6, fill: '#121213', hw: true },
);
decor.push({ t: 'text', x: W / 2, y: BOT + ROW_H + 46, text: 'behringer', size: 30, anchor: 'middle', weight: 500, hw: true });
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
  id: 'system-55', name: 'System 55', maker: 'Behringer', year: 2022,
  heritage: 'Based on the 1973 Moog System 55 modular',
  summary: 'Thirty-eight 900-series modules in three rows, nothing wired between them: two 921A drivers with six 921B oscillators, a 921, the 960 sequencer and 962 sequential switch, the 904A, 904B, 914 and 923 filters, five 902 amplifiers, four 911 envelopes and the 911A trigger delay, three mixers, three CP3A-O and the 992 control switchers, and five sets of attenuators.',
  view: { w: W, h: H },
  theme: { panel: '#0e0e0f', panel2: '#070708', ink: '#dcdcd8', font: 'din', cheeks: 'none', cheekW: 0, weight: 600 },
  silentInit: 'Nothing on a modular is connected until you patch it, so with no cables the System 55 is silent.',
  signalNames: rack.signalNames, destNames: rack.destNames,
  decor, areas, controls, jacks, init, toEngine, presets: sounds, lineage,
};
