// Behringer 2-XM — SynthDef. Positions are pixels on the 2000×626 product image, used directly as view units. The data model
// is the 2-XM synth.json (Quick Start Guide, 108 numbered controls), which follows the Oberheim Two Voice: two complete SEM
// voices side by side, a master section and a 16-jack patchbay per module.
//
// The two modules are two different voices, so toEngine() returns EngineParams `dual`: XM1 at the top level, XM2 in
// `dual.b` (see CONTRACT.md). Every control and jack of XM2 is the same as XM1's, 707 units to the right, so one builder
// draws both. XM2's jacks carry `part: 1`, which sends their cables to XM2's voice.
import { annotate, expMap, level10, fmtTime, fmtHz, fmtSemi } from '@/lib/maps.js';
import lineage from '@/synths/lineage/2-xm.js';
import unusual from '@/synths/unusual/2-xm.js';
import moreSounds from '@/synths/sounds/2-xm.js';

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The guide gives the envelope times and the LFO range. The tapers, the cutoff range, the resonance law, the pitch ranges of
// FINE and MODULATION and the crossfade law are this app's estimates (see src/lib/limits.js).
const attackTime = (v) => expMap(v / 10, 0.003, 6);
const decayTime = (v) => expMap(v / 10, 0.014, 18);
const releaseTime = (v) => expMap(v / 10, 0.01, 15);
const lfoHz = (v) => expMap(v / 10, 0.1, 55);
const vcfHz = (v) => expMap(v / 10, 20, 18000);
const portaTime = (v) => 3 * Math.pow(v / 10, 2);
/** VCO MODULATION turned counter-clockwise: frequency modulation depth in semitones. */
const fmDepth = (x) => 24 * Math.pow(Math.abs(x) / 5, 2);
/** VCF MODULATION: bipolar cutoff depth in octaves. */
const vcfOct = (x) => Math.sign(x) * 7 * Math.pow(Math.abs(x) / 5, 1.5);
const pct = (v) => `${Math.round(v * 10)} %`;
const DX = 707; // XM2 sits this far to the right of XM1

const controls = [];
const decor = [];
const jacks = [];
const INK = '#23221f';
const PANEL = '#f7f1dc';

// ── Drawing helpers ───────────────────────────────────────────────────────
/** Text centred on (x, y): the renderer places text by its baseline. */
const text = (x, y, t, size = 13, rest = {}) => decor.push({ t: 'text', x, y: y + size * 0.35, text: t, size, anchor: 'middle', ...rest });
const small = (x, y, t) => text(x, y, t, 11);
const frame = (x, y, w, h) => decor.push({ t: 'frame', x, y, w, h, r: 10, sw: 2, dash: '8 5', labelAt: 'none' });
const polar = (cx, cy, r, a) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
/** The two curved arrows printed round a small knob, pointing down at each end of its travel. */
const arrows = (x, y, r = 25) => {
  decor.push({ t: 'arc', x, y, r, a0: -148, a1: -32, w: 1.8 });
  decor.push({ t: 'arc', x, y, r, a0: 32, a1: 148, w: 1.8 });
  [[-148, -1], [148, 1]].forEach(([a, dir]) => {
    const tip = polar(x, y, r, a + dir * 9);
    const b1 = polar(x, y, r + 4.5, a - dir * 3);
    const b2 = polar(x, y, r - 4.5, a - dir * 3);
    decor.push({ t: 'path', d: `M${tip[0].toFixed(1)} ${tip[1].toFixed(1)} L${b1[0].toFixed(1)} ${b1[1].toFixed(1)} L${b2[0].toFixed(1)} ${b2[1].toFixed(1)} Z`, w: 0, fill: INK });
  });
};
const big = (id, x, y, rest) => controls.push({ id, type: 'knob', x, y, r: 42, style: 'obxa', kind: 'cont', min: 0, max: 10, def: 5, labelPos: 'none', ...rest });
const knob = (id, x, y, rest) => controls.push({ id, type: 'knob', x, y, r: 15, style: 'pro1', kind: 'cont', min: 0, max: 10, def: 5, labelPos: 'none', ...rest });
const slide = (id, x, y, rest) => controls.push({ id, type: 'slide', x, y, w: 54, h: 21, orient: 'h', labelPos: 'none', ...rest });
/** Printed 3.5 mm socket that is not part of the patching (STEREO OUT). */
const socket = (x, y, r = 18) => {
  decor.push({ t: 'circle', x, y, r: r * 1.02, fill: 'url(#kysBlack)', stroke: '#000', sw: 1.2 });
  decor.push({ t: 'circle', x, y, r: r * 0.68, fill: 'url(#kysNut)', stroke: '#2a2b2e', sw: 1 });
  decor.push({ t: 'circle', x, y, r: r * 0.46, fill: '#050505', stroke: 'none', sw: 0 });
};
const crossfade = (x) => (x === 0 ? 'off' : `${x < 0 ? 'saw' : 'pulse'} ${Math.round((Math.abs(x) / 5) * 100)} %`);
const bipolarFmt = (x, neg, pos) => (Math.abs(x) < 0.05 ? 'off' : `${x < 0 ? neg : pos} ${Math.round((Math.abs(x) / 5) * 100)} %`);

// ── Faceplate: shared artwork ─────────────────────────────────────────────
[[78.7, 25], [79, 603], [796, 25], [796, 603], [1203, 25], [1203, 603], [1920, 25], [1920, 603]].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 11 }));
[754, 1461.5, 1688.5, 1820.5].forEach((x) => decor.push({ t: 'line', x1: x, y1: 20, x2: x, y2: 606, w: 2 }));
text(401, 28, 'SYNTHESIZER EXPANDER MODULE 1', 20);
text(1187, 28, 'SYNTHESIZER EXPANDER', 20, { anchor: 'end' });
text(1219, 28, 'MODULE 2', 20, { anchor: 'start' });

// ── One module (XM1 or XM2) ───────────────────────────────────────────────
const MOD_SRC = (n) => [
  { v: `env${n}`, label: `ENV ${n}` }, { v: `env${n}_vel`, label: 'E+V' }, { v: 'lfo', label: 'LFO' },
];
const areas = [];
const R = (x0, y0, x1, y1) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });

function buildModule(k) {
  const ox = k * DX;
  const X = (x) => x + ox;
  const m = `xm${k + 1}`;
  const M = `XM${k + 1}`;
  const id = (s) => `${m}_${s}`;

  frame(X(60), 45, 131, 400);
  frame(X(251), 45, 132, 400);
  frame(X(419), 45, 323, 400);
  frame(X(83), 457, 276, 126);
  frame(X(442), 457, 276, 126);

  // VCO 1 and VCO 2: the same column twice, 192 units apart
  [1, 2].forEach((n) => {
    const cx = X(125 + 192 * (n - 1));
    const vco = `VCO ${n}`;
    text(cx, 59, vco, 19);
    text(cx, 78, 'FREQUENCY');
    big(id(`vco${n}.coarse`), cx, 134.5, {
      name: `${M} VCO ${n} frequency`, module: 'osc', fmt: (v) => fmtSemi((v - 5) * 6),
      help: `Tunes ${M}’s ${vco} over five octaves. The knob is continuous, so intervals are set by ear: each step of the scale is six semitones, so 7 is an octave up and 3 an octave down.`,
    });
    knob(id(`vco${n}.fine`), cx + 66, 81, {
      min: -5, max: 5, def: 0, name: `${M} VCO ${n} fine tune`, module: 'osc', fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 20)} cents`,
      help: `Fine tuning for ${M}’s ${vco}, here up to a semitone either way. Set it a little off the other oscillator and the two beat slowly, which thickens the sound.`,
    });
    text(cx, 201, 'MODULATION');
    knob(id(`vco${n}.modulation`), cx + 1, 237, {
      min: -5, max: 5, def: 0, name: `${M} VCO ${n} modulation`, module: 'mod',
      fmt: (v) => (Math.abs(v) < 0.05 ? 'off' : v < 0 ? `FM ${fmtSemi(fmDepth(v))}` : `PWM ${Math.round((v / 5) * 80)} %`),
      help: `One knob, two jobs. Turned left of centre it moves ${vco}’s pitch (FREQ); turned right it moves its pulse width (PW). The switch below picks what does the moving. At the centre it does nothing.`,
    });
    arrows(cx + 1, 237);
    small(cx - 26, 267.5, 'FREQ');
    small(cx + 24, 267.5, 'PW');
    small(cx - 39, 296, 'ENV');
    small(cx + 1, 296, 'E+V');
    small(cx + 38, 296, 'LFO');
    small(cx - 33, 309, String(n));
    slide(id(`vco${n}.mod_source`), cx + 4, 316.5, {
      w: 53, h: 20, kind: 'enum', options: MOD_SRC(n), def: `env${n}`, name: `${M} VCO ${n} modulation source`, module: 'mod',
      help: `What the MODULATION knob above uses to move ${vco}: ENV ${n} (a sweep on every note), E+V (the same envelope, deeper the harder you play) or the LFO (a steady wobble).`,
    });
    text(cx, 357, 'PULSE WIDTH');
    knob(id(`vco${n}.pulse_width`), cx + 1, 393.5, {
      min: 10, max: 90, def: 50, name: `${M} VCO ${n} pulse width`, module: 'osc', fmt: (v) => `${Math.round(v)} %`,
      help: `Width of ${vco}’s pulse wave. At 50 % it is a square, hollow like a clarinet; towards either end it thins to a nasal, reedy pulse. Only heard when the VCO ${n} knob in the VCF is turned towards PUL.`,
    });
    arrows(cx + 1, 393.5);
    small(cx - 24, 424, '10%');
    small(cx + 26, 424, '90%');
  });
  text(X(221), 158, 'SYNC');
  small(X(262), 179.5, 'ON');
  slide(id('vco2.sync'), X(223), 178.5, {
    kind: 'bool', def: false, onAt: 'bottom', name: `${M} VCO 2 sync`, module: 'osc',
    help: `Hard sync: VCO 2 restarts every time VCO 1 does. VCO 2’s FREQUENCY then changes its tone rather than its note, from a hollow buzz to a tearing snarl.`,
  });

  // VCF
  text(X(581), 59, 'VCF', 19);
  text(X(484), 78, 'FREQUENCY');
  big(id('vcf.frequency'), X(484), 134.6, {
    def: 8, name: `${M} VCF frequency`, module: 'filter', fmt: (v) => fmtHz(vcfHz(v)),
    help: `The filter’s cutoff. What it does depends on the NOTCH knob: in low-pass, lower is darker; in high-pass, higher is thinner; in the middle it moves a notch through the sound.`,
  });
  text(X(676), 78, 'RESONANCE');
  big(id('vcf.resonance'), X(676), 134.3, {
    def: 0, name: `${M} VCF resonance`, module: 'filter', fmt: pct,
    help: `A boost at the cutoff that makes the filter sound vocal. This 2-pole filter stays smooth and round even when turned well up.`,
  });
  text(X(485), 201, 'MODULATION');
  knob(id('vcf.modulation'), X(486), 237.5, {
    min: -5, max: 5, def: 0, name: `${M} VCF modulation`, module: 'filter',
    fmt: (v) => (Math.abs(v) < 0.05 ? 'off' : `${v > 0 ? '+' : '−'}${Math.abs(vcfOct(v)).toFixed(1)} oct`),
    help: `How far the source on the switch below moves the cutoff. Right of centre pushes it up, left of centre pulls it down, so the envelope can close the filter as well as open it.`,
  });
  arrows(X(486), 237.5);
  small(X(470), 267.5, '−');
  small(X(501), 267.5, '+');
  text(X(676), 201, 'NOTCH');
  knob(id('vcf.notch'), X(676), 237.5, {
    min: -5, max: 5, def: -5, name: `${M} VCF notch`, module: 'filter',
    fmt: (v) => { const t = (v + 5) / 10; return t < 0.04 ? 'low-pass' : t > 0.96 ? 'high-pass' : Math.abs(t - 0.5) < 0.04 ? 'notch' : `${Math.round((1 - t) * 100)} % LP · ${Math.round(t * 100)} % HP`; },
    help: `Sweeps the filter type. Fully left is low-pass, fully right high-pass, and in the middle the two meet in a notch that takes a slice out of the sound. With RESPONSE at BP this knob does nothing.`,
  });
  arrows(X(676), 237.5);
  small(X(658), 267.5, 'LP');
  small(X(697), 267.5, 'HP');
  small(X(446), 296, 'ENV');
  small(X(483), 296, 'EXT');
  small(X(521), 296, 'LFO');
  small(X(446), 309, '2');
  slide(id('vcf.mod_source'), X(487), 316.4, {
    kind: 'enum', options: [{ v: 'env2', label: 'ENV 2' }, { v: 'ext', label: 'EXT' }, { v: 'lfo', label: 'LFO' }], def: 'env2',
    name: `${M} VCF modulation source`, module: 'filter',
    help: `What MODULATION uses to move the cutoff: ENV 2, the LFO, or EXT. EXT is a cable in ${M}’s VCF CV jack; with no cable there, it is ENV 2 scaled by how hard you play.`,
  });
  small(X(649), 296, 'LP-HP');
  small(X(715), 296, 'BP');
  slide(id('vcf.response'), X(679), 316.5, {
    w: 53, h: 20, kind: 'enum', options: [{ v: 'lp_hp', label: 'LP-HP' }, { v: 'bp', label: 'BP' }], def: 'lp_hp',
    name: `${M} VCF response`, module: 'filter',
    help: `LP-HP lets the NOTCH knob sweep from low-pass through notch to high-pass. BP switches to band-pass: only a band around the cutoff gets through, thin and nasal.`,
  });
  [['mix_vco1', 485, 'VCO 1', 'SAW', 'PUL', 469, 508], ['mix_vco2', 580, 'VCO 2', 'SAW', 'PUL', 564, 604], ['mix_ext', 676.5, 'EXT', 'IN', 'NOISE', 657, 706]]
    .forEach(([p, x, top, l, r, lx, rx]) => {
      text(X(x - 1), 357, top);
      small(X(lx), 424, l);
      small(X(rx), 424, r);
      arrows(X(x), 393);
    });
  knob(id('vcf.mix_vco1'), X(485), 393, {
    min: -5, max: 5, def: -3, name: `${M} VCO 1 into the filter`, module: 'mixer', fmt: crossfade,
    help: `How VCO 1 reaches the filter. Left of centre it sends the sawtooth, right of centre the pulse, getting louder the further you turn. At the centre VCO 1 is silent.`,
  });
  knob(id('vcf.mix_vco2'), X(580), 393, {
    min: -5, max: 5, def: 0, name: `${M} VCO 2 into the filter`, module: 'mixer', fmt: crossfade,
    help: `How VCO 2 reaches the filter: sawtooth to the left, pulse to the right, silent at the centre.`,
  });
  knob(id('vcf.mix_ext'), X(676.5), 393, {
    min: -5, max: 5, def: 0, name: `${M} external input or noise`, module: 'mixer', fmt: (v) => bipolarFmt(v, 'in', 'noise'),
    help: `Left of centre brings in ${M}’s EXT input, at the level set by ${M} EXT LVL; with no cable there that is a 440 Hz tuning tone. Right of centre brings in white noise. At the centre, neither.`,
  });

  // ENV 1 (VCA), LFO and VCA switch, ENV 2
  text(X(200), 473, 'ENV 1', 19);
  text(X(252), 474, '(VCA)', 14);
  text(X(581), 473, 'ENV 2', 19);
  const ENV_DEF = { 1: [0, 3, 10], 2: [0, 4, 4] };
  [1, 2].forEach((n) => {
    const ex = n === 1 ? [126, 221.5, 317.5] : [485, 580, 676.3];
    const what = n === 1 ? 'the loudness of each note and VCO 1’s modulation' : 'the filter and VCO 2’s modulation';
    [['attack', 'ATTACK'], ['decay', 'DECAY'], ['sustain', 'SUSTAIN']].forEach(([st, label], i) => {
      text(X(ex[i]), 494, label);
      knob(id(`env${n}.${st}`), X(ex[i]), 530.5, {
        def: ENV_DEF[n][i], name: `${M} ENV ${n} ${st}`, module: 'env',
        fmt: st === 'attack' ? (v) => fmtTime(attackTime(v)) : st === 'decay' ? (v) => `${fmtTime(decayTime(v))} · release ${fmtTime(releaseTime(v))}` : pct,
        help: {
          attack: `ENV ${n}: how long it takes to rise to full after a key goes down, from 3 ms to 6 s. It shapes ${what}.`,
          decay: `ENV ${n}: how long it takes to fall to the sustain level, and also how long it takes to die away after the key is let go. There is no separate release knob.`,
          sustain: `ENV ${n}: the level held while the key is down. At 0 every note dies away by itself; at 10 the envelope stays at full until you let go.`,
        }[st],
      });
    });
  });
  text(X(400), 440.5, 'LFO');
  knob(id('lfo.rate'), X(401), 477, {
    def: 5, name: `${M} LFO rate`, module: 'lfo', fmt: (v) => fmtHz(lfoHz(v)),
    help: `Speed of ${M}’s LFO, from one cycle every 10 seconds to 55 Hz. It reaches the sound only through the LFO position of a modulation switch.`,
  });
  text(X(401), 526, 'VCA');
  small(X(357), 548, 'ENV');
  small(X(401), 569, 'E+V');
  small(X(449), 541, 'ON/');
  small(X(449), 553, 'EXT');
  slide(id('vca.mode'), X(402), 546.7, {
    kind: 'enum', options: [{ v: 'env', label: 'ENV' }, { v: 'env_vel', label: 'E+V' }, { v: 'on_ext', label: 'ON/EXT' }], def: 'env',
    name: `${M} VCA mode`, module: 'amp',
    help: `What opens ${M}’s amplifier. ENV: ENV 1 shapes each note. E+V: the same, louder the harder you play. ON/EXT: held open, so the module drones without a key, unless a cable in VCA CV takes over.`,
  });

  // Master section: this module's column
  const mx = k === 0 ? 1520.5 : 1627.2;
  frame(mx - 47.5, 244, 96, 339);
  text(mx, 258, k === 0 ? 'XM-1' : 'XM-2', 19);
  text(mx, 275, 'LEVEL');
  knob(`${m}.level`, mx, 308, {
    def: k === 0 ? 7 : 0, name: `${M} level`, module: 'out', fmt: pct,
    help: `How loud ${M} is in the output. At 0 ${M} is not heard at all, whatever its own panel is doing.`,
  });
  arrows(mx, 308);
  text(mx, 347, 'PAN');
  knob(`${m}.pan`, mx, 384, {
    min: -5, max: 5, def: 0, name: `${M} pan`, module: 'out',
    fmt: (v) => (Math.abs(v) < 0.1 ? 'centre' : `${v < 0 ? 'left' : 'right'} ${Math.round((Math.abs(v) / 5) * 100)} %`),
    help: `Where ${M} sits between the left and right speakers. Pan the two modules apart and each keeps its own side, which makes two lines easy to follow.`,
  });
  arrows(mx, 384);
  text(mx, 422, 'EXT LVL');
  knob(`${m}.ext_level`, mx, 459, {
    def: 5, name: `${M} EXT level`, module: 'mixer', fmt: pct,
    help: `Level of whatever is in ${M}’s EXT jack, or of the 440 Hz tuning tone when nothing is. It is only heard with the EXT knob in ${M}’s VCF turned towards IN.`,
  });
  arrows(mx, 459);
  text(mx, 488, 'PORTA-');
  text(mx, 501, 'MENTO');
  knob(`${m}_pitch.portamento`, mx, 530, {
    def: 0, name: `${M} portamento`, module: 'glide', fmt: (v) => (v <= 0 ? 'off' : fmtTime(portaTime(v))),
    help: `How long ${M}’s pitch takes to slide from one note to the next, up to 3 seconds. Only works while the portamento ON switch is up.`,
  });

  // Patchbay: inputs on the left, outputs on the right
  const px = k === 0 ? [1721.5, 1787.5] : [1853.5, 1919.5];
  const ROWS = [89, 152, 215, 277.5, 340.5, 403.5, 466, 529];
  const heard = (v) => (v[`${m}.level`] <= 0 ? `${M} LEVEL is at 0 in the master section, so nothing ${M} does is heard. Turn ${M} LEVEL up.` : null);
  const first = (...fs) => (v) => { for (const f of fs) { const w = f(v); if (w) return w; } return null; };
  const plate = (x, y, label, out) => {
    decor.push({ t: 'rect', x: x - 28, y: y - 31.5 - 6.5, w: 56, h: 13, r: 2.5, fill: out ? INK : PANEL, stroke: INK, sw: 1.3 });
    text(x, y - 31.5, label, 10, out ? { fill: PANEL, weight: 700 } : { weight: 600 });
  };
  const jack = (key, col, row, label, dir, rest) => {
    const x = px[col], y = ROWS[row];
    plate(x, y, label, dir === 'out');
    jacks.push({ id: `j.${m}.${key}`, x, y, r: 18, label, name: `${M} ${label}`, labelPos: 'none', dir, part: k, ...rest });
  };
  const pitchHear = (who) => (v, x) => (x.kind === 'kbd'
    ? `${who} now plays the notes carried by ${x.src} instead of ${M}’s own. From the other module’s CV output, both modules play the same notes whatever ASSIGN says.`
    : `${who} no longer follows the keys: ${x.kind === 'lfo' ? `its pitch rises and falls with ${x.src}` : x.kind === 'env' ? `its pitch follows the shape of ${x.src}` : `its pitch is set by ${x.src}`}, one octave for each full step of the signal, and every key plays the same note.`);
  jack('ext', 0, 0, 'EXT', 'in', {
    dest: 'extIn', amt: 1,
    check: first(heard, (v) => (v[id('vcf.mix_ext')] >= 0 ? `The EXT knob in ${M}’s VCF is not turned towards IN, so this input is not heard. Turn it left of centre.` : v[`${m}.ext_level`] <= 0 ? `${M} EXT LVL is at 0. Turn it up.` : null)),
    help: `External audio into ${M}’s filter, through the EXT knob (turned towards IN) at the level of ${M} EXT LVL. With nothing plugged in, a 440 Hz tuning tone takes its place.`,
  });
  jack('vcf_cv', 0, 1, 'VCF CV', 'in', {
    dest: 'cutoff', amt: (v) => (v[id('vcf.mod_source')] === 'ext' ? vcfOct(v[id('vcf.modulation')]) : 0),
    check: first(heard, (v) => (v[id('vcf.mod_source')] !== 'ext' ? `${M}’s VCF modulation switch is not at EXT, so this input is ignored. Move the switch to EXT.` : Math.abs(v[id('vcf.modulation')]) < 0.05 ? `${M}’s VCF MODULATION is at the centre. Turn it either way to set the depth.` : null)),
    help: `Moves ${M}’s cutoff from outside, when the VCF modulation switch is at EXT. The MODULATION knob sets how far and which way. A cable here replaces the velocity-scaled ENV 2 that EXT otherwise uses.`,
  });
  jack('vca_cv', 0, 2, 'VCA CV', 'in', {
    dest: 'amp', amt: (v) => (v[id('vca.mode')] === 'on_ext' ? 1 : 0),
    check: first(heard, (v) => (v[id('vca.mode')] !== 'on_ext' ? `${M}’s VCA switch is not at ON/EXT, so this input is ignored. Move it to ON/EXT.` : null)),
    help: `Controls ${M}’s amplifier from outside, when the VCA switch is at ON/EXT. The signal patched here then decides how loud ${M} is, in place of ENV 1.`,
  });
  jack('vco1_cv', 0, 3, 'VCO 1 CV', 'in', {
    dest: 'multIn', amt: 1, check: heard, hear: pitchHear(`VCO 1 (and VCO 2 as well, unless VCO 2 CV has its own cable)`),
    help: `Pitch control for VCO 1, one octave per volt, in place of ${M}’s MIDI pitch. VCO 2 follows it too, unless VCO 2 CV has a cable of its own.`,
  });
  jack('vco2_cv', 0, 4, 'VCO 2 CV', 'in', {
    dest: 'pitch2', amt: 12, check: heard, hear: pitchHear('VCO 2'),
    help: `Pitch control for VCO 2 alone, one octave per volt, in place of ${M}’s MIDI pitch. Use it to play the two oscillators from different sources.`,
  });
  jack('lfo_trig', 0, 5, 'LFO TRIG', 'in', {
    dest: 'lfoTrig', amt: 1, check: heard,
    help: `Restarts ${M}’s LFO from the beginning of its cycle each time a trigger arrives, so the wobble lines up with something else.`,
  });
  jack('env_gate', 0, 6, 'ENV GATE', 'in', {
    dest: 'gateIn', amt: 1, check: heard,
    help: `Fires both of ${M}’s envelopes from outside, in place of the MIDI gate. The keys still set the pitch; the envelopes follow whatever is patched here.`,
  });
  jack('cv_out', 0, 7, k === 0 ? 'CV 1' : 'CV 2', 'out', {
    signal: 'kbd',
    help: `The pitch ${M} is being played at, as a control voltage. Printed in the input column; the guide lists it as an output. Patch it into the other module’s VCO CV to make both play ${M}’s notes.`,
  });
  jack('vca', 1, 0, 'VCA', 'out', { signal: 'vca', help: `${M}’s finished sound: the VCA output, before LEVEL and PAN.` });
  jack('vcf', 1, 1, 'VCF', 'out', { signal: 'vcf1', help: `${M}’s filter output, before the amplifier. It is not shaped by ENV 1.` });
  jack('vco1', 1, 2, 'VCO 1', 'out', {
    signal: 'o1saw', help: `VCO 1 on its own, before the filter. The guide does not say which wave comes out here; this app gives the sawtooth.`,
  });
  jack('vco2', 1, 3, 'VCO 2', 'out', {
    signal: 'o2saw', help: `VCO 2 on its own, before the filter. The guide does not say which wave comes out here; this app gives the sawtooth.`,
  });
  jack('env1', 1, 4, 'ENV 1', 'out', { signal: 'env1', help: `${M}’s ENV 1 as a control voltage, rising and falling with every note.` });
  jack('env2', 1, 5, 'ENV 2', 'out', { signal: 'env2', help: `${M}’s ENV 2 as a control voltage.` });
  jack('lfo', 1, 6, 'LFO', 'out', { signal: 'lfo', help: `${M}’s LFO as a control voltage. Its shape is not stated in the guide; this app uses a triangle.` });
  jack('gate', 1, 7, k === 0 ? 'GATE 1' : 'GATE 2', 'out', { signal: 'gate', help: `High while ${M} is playing a note, low otherwise.` });
  // IN / OUT legend under the jacks
  const lx = (px[0] + px[1]) / 2;
  decor.push({ t: 'rect', x: lx - 32, y: 570.5, w: 32, h: 13, r: 2.5, fill: PANEL, stroke: INK, sw: 1.3 });
  decor.push({ t: 'rect', x: lx, y: 570.5, w: 32, h: 13, r: 2.5, fill: INK, stroke: INK, sw: 1.3 });
  text(lx - 16, 577, 'IN', 10, { weight: 600 });
  text(lx + 16, 577, 'OUT', 10, { fill: PANEL, weight: 700 });
  text(lx, 28, k === 0 ? 'XM-1' : 'XM-2', 20);

  // Areas
  const x0 = k === 0 ? 41 : 755;
  const x1 = k === 0 ? 753 : 1461;
  areas.push(
    { id: `${m}-vco1`, label: `${M} VCO 1`, module: 'osc', keywords: 'oscillator tune pitch pwm frequency modulation fm',
      rects: [R(x0, 40, X(200), 450)],
      help: `${M}’s first oscillator. The big FREQUENCY knob tunes it over five octaves and the small one fine-tunes it. MODULATION moves its pitch (turned left) or its pulse width (turned right), using ENV 1, ENV 1 with velocity, or the LFO. PULSE WIDTH sets the width of its pulse wave.` },
    { id: `${m}-vco2`, label: `${M} VCO 2`, module: 'osc', keywords: 'oscillator tune pitch sync hard sync pwm',
      rects: [R(X(200), 40, X(400), 450)],
      help: `${M}’s second oscillator, the same as VCO 1 except that its MODULATION uses ENV 2, and SYNC can lock it to VCO 1 so that its FREQUENCY changes the tone rather than the note.` },
    { id: `${m}-vcf`, label: `${M} VCF`, module: 'filter', keywords: 'filter cutoff resonance notch low-pass high-pass band-pass state variable sem',
      rects: [R(X(400), 40, x1, 340)],
      help: `${M}’s 12 dB filter. FREQUENCY sets the cutoff and RESONANCE the emphasis. NOTCH sweeps the filter type from low-pass through a notch to high-pass; RESPONSE at BP makes it band-pass instead. MODULATION moves the cutoff up or down from ENV 2, an outside CV (EXT) or the LFO.` },
    { id: `${m}-mix`, label: `${M} filter inputs`, module: 'mixer', keywords: 'mixer level saw pulse noise external crossfade',
      rects: [R(X(400), 340, x1, 450)],
      help: `What goes into ${M}’s filter. There are no ordinary level knobs: each knob is off at the centre and fades in one sound to the left and another to the right. VCO 1 and VCO 2 each give sawtooth or pulse; EXT gives the external input (or a tuning tone) or white noise.` },
    { id: `${m}-env1`, label: `${M} ENV 1 (VCA)`, module: 'amp', keywords: 'envelope loudness amplifier ads attack decay sustain release',
      rects: [R(x0, 450, X(372), 612)],
      help: `The envelope that shapes the loudness of ${M}’s notes: ATTACK, DECAY and SUSTAIN. DECAY also sets how long a note takes to die away after you let go. It can move VCO 1 too, through VCO 1’s MODULATION knob.` },
    { id: `${m}-lfo`, label: `${M} LFO`, module: 'lfo', keywords: 'lfo vibrato wobble rate speed modulation',
      rects: [R(X(372), 450, X(432), 512)],
      help: `${M}’s low-frequency oscillator, with one knob for its speed. It does nothing until a modulation switch is set to LFO: on VCO 1, VCO 2 or the VCF.` },
    { id: `${m}-vca`, label: `${M} VCA`, module: 'amp', keywords: 'amplifier drone velocity gate',
      rects: [R(X(372), 512, X(432), 612)],
      help: `What opens ${M}’s amplifier: ENV 1, ENV 1 scaled by velocity (E+V), or ON/EXT, which holds it open for a drone or hands it to a cable in VCA CV.` },
    { id: `${m}-env2`, label: `${M} ENV 2`, module: 'env', keywords: 'envelope filter ads attack decay sustain contour',
      rects: [R(X(432), 450, x1, 612)],
      help: `${M}’s second envelope, for the filter (through the VCF MODULATION knob) and for VCO 2 (through its MODULATION knob). ATTACK, DECAY and SUSTAIN; DECAY sets the release as well.` },
    { id: `${m}-out`, label: `${M} output`, module: 'out', keywords: 'level volume pan stereo external level portamento glide',
      rects: [R(k === 0 ? 1462 : 1580, 238, k === 0 ? 1569.5 : 1688, 612)],
      help: `${M}’s strip in the master section: LEVEL and PAN place it in the stereo mix, EXT LVL sets the level of its external input, and PORTAMENTO sets how slowly it glides between notes.` },
    { id: `${m}-patch`, label: `${M} patchbay`, module: 'util', keywords: 'patch cable jack cv gate input output modular',
      rects: [R(k === 0 ? 1689 : 1821, 40, k === 0 ? 1820 : 1961, 612)],
      help: `Sixteen jacks for ${M}: inputs in the left column (outlined labels) and outputs in the right (solid labels). Cables can run between the two modules, so one module can modulate or process the other.` },
  );
}
buildModule(0);
buildModule(1);

// ── Master section: shared controls ───────────────────────────────────────
text(1575, 35, '2-XM', 36, { weight: 700, spacing: '0.02em' });
text(1521, 78, 'STEREO');
text(1521, 93, 'OUT');
socket(1521, 133.5);
decor.push({ t: 'led', x: 1575, y: 78, r: 6, color: 'red' });
text(1629, 78, 'MIDI IN');
decor.push({ t: 'din', x: 1629, y: 133.5, r: 42 });
text(1521, 183, 'MASTER');
knob('output.master', 1521, 216, {
  def: 7, name: 'MASTER', module: 'out', fmt: pct,
  help: 'The overall output level, after both modules’ LEVEL and PAN.',
});
arrows(1521, 216);
text(1629, 183, 'ASSIGN');
small(1597, 198, 'UNI');
small(1631, 198, 'SPLIT');
small(1668, 198, 'DUO');
slide('alloc.assign', 1631, 217.5, {
  kind: 'enum', options: [{ v: 'unison', label: 'UNI' }, { v: 'split', label: 'SPLIT' }, { v: 'duo', label: 'DUO' }], def: 'unison',
  name: 'ASSIGN', module: 'mode',
  help: 'How notes are shared between the two modules. UNI: both play every note, and a second held key goes to XM2. SPLIT: keys below middle C play XM1, the rest XM2. DUO: each new key goes to whichever module is free, so two-note chords and overlapping lines play on separate modules.',
});
text(1575, 450, 'ON', 12);
controls.push({
  id: 'alloc.portamento_on', type: 'slide', x: 1574.3, y: 488.8, w: 20, h: 54, orient: 'v', labelPos: 'none', kind: 'bool', def: false,
  name: 'Portamento ON', module: 'glide',
  help: 'Switches portamento on for both modules. Each module’s PORTAMENTO knob then sets its own glide time.',
});
areas.push(
  { id: 'master', label: 'Master and output', module: 'out', keywords: 'volume master stereo output midi power',
    rects: [R(1462, 40, 1575, 238)],
    help: 'The overall output level (MASTER) and the stereo output socket. Each module’s LEVEL and PAN below it decide how the two share the stereo picture.' },
  { id: 'assign', label: 'Voice assignment', module: 'mode', keywords: 'unison split duo duophonic keyboard mode midi voice priority',
    rects: [R(1575, 40, 1688, 238)],
    help: 'MIDI IN and the ASSIGN switch, which decides how incoming notes reach the two modules: both on every note (UNI), low keys to XM1 and high keys to XM2 (SPLIT), or one note per module as you play (DUO).' },
  { id: 'porta', label: 'Portamento switch', module: 'glide', keywords: 'glide portamento slide legato',
    rects: [R(1569.5, 238, 1580, 612)],
    help: 'Turns portamento on for both modules at once. How long the glide takes is set separately for each module with its PORTAMENTO knob.' },
);
annotate(unusual, controls, jacks, areas);

// ── Engine mapping ────────────────────────────────────────────────────────
const MOD_SIG = { env1: 'env1', env1_vel: 'env1v', env2: 'env2', env2_vel: 'env2v', lfo: 'lfo' };

/** One module's voice. `k` = 0 for XM1, 1 for XM2. */
function voiceOf(v, k, patched) {
  const m = `xm${k + 1}`;
  const g = (s) => v[`${m}_${s}`];
  const pj = (s) => !!patched[`j.${m}.${s}`];
  const routes = [];
  const route = (src, dst, amt) => { if (amt !== 0) routes.push({ src, dst, amt }); };

  // MODULATION: left of centre moves the pitch, right of centre the pulse width
  [1, 2].forEach((n) => {
    const x = g(`vco${n}.modulation`);
    const src = MOD_SIG[g(`vco${n}.mod_source`)];
    if (x < 0) route(src, `pitch${n}`, fmDepth(x));
    else if (x > 0) route(src, `pw${n}`, 0.4 * (x / 5));
  });
  // VCO 1 CV replaces the MIDI pitch of both VCOs, VCO 2 CV that of VCO 2 alone. VCO 1 CV arrives through the multiple.
  const cv1 = pj('vco1_cv'), cv2 = pj('vco2_cv');
  if (cv1) { route('mult', 'pitch1', 12); if (!cv2) route('mult', 'pitch2', 12); }

  const xf = (x) => ({ saw: Math.max(0, -x) / 5, pulse: Math.max(0, x) / 5 });
  const vcoOf = (n) => {
    const x = g(`vcf.mix_vco${n}`);
    return {
      level: x === 0 ? 0 : 0.42, mix: xf(x), pw: g(`vco${n}.pulse_width`) / 100,
      semi: (g(`vco${n}.coarse`) - 5) * 6 + g(`vco${n}.fine`) * 0.2,
      kbd: n === 1 ? !cv1 : !(cv1 || cv2), fixedNote: 60, syncTo: n === 2 && g('vco2.sync') ? 0 : -1,
    };
  };
  // EXT: the external input, or the A440 tuning tone (a third, fixed oscillator) when nothing is plugged in
  const ex = g('vcf.mix_ext');
  const inAmt = Math.max(0, -ex) / 5, nzAmt = Math.max(0, ex) / 5;
  const extLvl = level10(v[`${m}.ext_level`]);
  const extIn = pj('ext');
  const tone = { level: extIn ? 0 : 0.35 * inAmt * extLvl, mix: { sine: 1 }, pw: 0.5, semi: 0, kbd: false, fixedNote: 69, syncTo: -1 };

  const fm = g('vcf.modulation');
  const oct = vcfOct(fm);
  const fsrc = g('vcf.mod_source');
  let envAmt = 0, envSrc = 'env2';
  if (fsrc === 'env2') envAmt = oct;
  else if (fsrc === 'ext' && !pj('vcf_cv')) { envAmt = oct; envSrc = 'env2v'; }
  else if (fsrc === 'lfo') route('lfo', 'cutoff', oct * 0.5);
  const bp = g('vcf.response') === 'bp';

  const vm = g('vca.mode');
  const envOf = (n) => ({ a: attackTime(g(`env${n}.attack`)), d: decayTime(g(`env${n}.decay`)), s: g(`env${n}.sustain`) / 10, r: releaseTime(g(`env${n}.decay`)) });
  return {
    osc: [vcoOf(1), vcoOf(2), tone],
    oscOuts: true,
    noise: { level: 0.4 * nzAmt, color: 'white' },
    ext: { level: extIn ? inAmt * extLvl : 0 },
    filter: {
      type: 'svf', mode: bp ? 'bp' : 'morph', ...(bp ? {} : { morph: (g('vcf.notch') + 5) / 10 }),
      cutoff: vcfHz(g('vcf.frequency')), res: (g('vcf.resonance') / 10) * 0.96, envAmt, envSrc, kbd: 0,
    },
    env1: envOf(1), env2: envOf(2),
    // band-pass passes only a slice of the sound, so it is given make-up gain to sit level with the other responses
    vca: { ...(vm === 'on_ext' ? { envSrc: 'none', bias: pj('vca_cv') ? 0 : 1 } : { envSrc: vm === 'env_vel' ? 'env1v' : 'env1', bias: 0 }), gain: bp ? 2.2 : 1 },
    lfo: { rate: lfoHz(g('lfo.rate')), mix: { tri: 1 }, keySync: false },
    glide: { time: v['alloc.portamento_on'] ? portaTime(v[`${m}_pitch.portamento`]) : 0, legato: false },
    trig: { retrig: false, drone: false, repeat: false, src: ['gate', 'gate'] },
    paraphonic: false,
    routes,
    normals: { gateIn: 'gate' },
    od: { on: false }, delay: { on: false },
    sh: { rate: 5, glide: 0 }, slew: { time: 0.1 }, att: [1, 1],
    tune: 0,
  };
}

function toEngine(v, ctx = {}) {
  const patched = ctx.patched || {};
  return {
    ...voiceOf(v, 0, patched),
    volume: level10(v['output.master'], 1),
    dual: {
      b: voiceOf(v, 1, patched),
      assign: v['alloc.assign'], split: 60,
      level: [level10(v['xm1.level'], 2.2), level10(v['xm2.level'], 2.2)],
      pan: [v['xm1.pan'] / 5, v['xm2.pan'] / 5],
    },
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
/** Settings for one module, written without the module prefix: xm(2, { 'vcf.frequency': 4, level: 7 }). */
const xm = (k, o) => Object.fromEntries(Object.entries(o).map(([key, val]) => [
  ['level', 'pan', 'ext_level'].includes(key) ? `xm${k}.${key}` : key === 'portamento' ? `xm${k}_pitch.portamento` : `xm${k}_${key}`, val]));
const both = (o) => ({ ...xm(1, o), ...xm(2, o) });

const presets = [
  {
    id: 'sem-brass', name: 'SEM Brass', ref: 'In the style of 1970s Oberheim synth brass', artist: 'Oberheim SEM',
    tags: ['brass', 'funk', '70s'], level: 1,
    blurb: 'A bright, round brass voice with a soft swell at the front of every note.',
    how: 'Two sawtooths, one a few cents off, go through the 12 dB low-pass filter. ENV 2 opens the filter a little more slowly than the loudness rises, which gives the brassy swell. The SEM filter stays smooth even when it opens wide, which is why its brass sounds rounder than a Moog’s.',
    phrase: { bpm: 104, loop: true, steps: [[0, 55, 0.9], [1, 58, 0.45], [1.5, 60, 0.45], [2, 62, 1.4], [3.5, 60, 0.45]] },
    steps: [
      { title: 'Two sawtooths, slightly apart', module: 'osc', why: 'Two sawtooth waves from XM1’s two oscillators go into its filter, one tuned a hair sharp. The slow beating between them is what makes one synth note sound more like a section than a single buzzy tone.\n- VCO 1 and VCO 2 into VCF −4 (saw 80 %): the VCOs (voltage-controlled oscillators) make the raw tone. The SEM has no level knobs: each VCO knob in the VCF (filter) section is silent at the centre, sends the sawtooth to the left and the pulse to the right. A saw carries every harmonic, the brassiest raw material.\n- VCO 2 fine tune +0.6 (+12 cents): about an eighth of a semitone sharp. Too little to sound out of tune, enough to make the two waves drift against each other. More is wider and wobblier; at 0 the note goes narrow and static.\n- Listen for: a bright, buzzy note with a slow wobble in it. Set VCO 2 fine tune back to 0 and the wobble stops.',
        set: xm(1, { 'vcf.mix_vco1': -4, 'vcf.mix_vco2': -4, 'vco2.fine': 0.6 }) },
      { title: 'Close the filter', module: 'filter', why: 'The VCF (voltage-controlled filter) trims the top off the two saws. Pulled well down, it leaves a dull, muted note, which is the resting point the envelope will open from in the next step.\n- VCF frequency 4 (304 Hz): the cutoff. With NOTCH fully left, where it starts, the filter is low-pass: it keeps the lows and cuts the highs, so lower is darker. At about 300 Hz most of the buzz is gone.\n- VCF resonance 2 (20 %): a small boost right at the cutoff. The SEM’s 12 dB (2-pole) filter stays smooth, so this adds a little roundness rather than a whistle.\n- Listen for: the brightness from step 1 gone, leaving a soft, woolly note. Sweep FREQUENCY up and back to hear how much of the brass lives above the cutoff.',
        set: xm(1, { 'vcf.frequency': 4, 'vcf.resonance': 2 }) },
      { title: 'Let ENV 2 open it', module: 'env', why: 'ENV 2 is XM1’s second envelope, a shape that rises and falls on every note. Its switch under the VCF MODULATION knob starts at ENV 2, so turning the knob lets it open the cutoff as each note starts and settle back: the swell that makes a note sound blown rather than switched on.\n- VCF modulation +2.8 (+2.9 oct): how far ENV 2 lifts the cutoff above 304 Hz at its peak, almost three octaves. More gives a brighter, brassier bite; left of centre would close the filter instead.\n- ENV 2 attack 3.5 (43 ms): how long the filter takes to open. It is slower than the loudness, so each note swells into brightness. Shorter gives a harder “blat”.\n- ENV 2 decay 5 (500 ms), sustain 4 (40 %): after the peak the filter falls over half a second to 40 % of the way up and holds there. DECAY also sets the release (390 ms).\n- Listen for: a “waah” at the start of each note, then a mellower tone while you hold it. Turn ENV 2 attack to 0 and the swell becomes a sharp bark.',
        set: xm(1, { 'vcf.modulation': 2.8, 'env2.attack': 3.5, 'env2.decay': 5, 'env2.sustain': 4 }) },
      { title: 'Shape the loudness', module: 'amp', why: 'ENV 1 shapes the loudness through the VCA (voltage-controlled amplifier). The SEM envelopes have only ATTACK, DECAY and SUSTAIN: with sustain at full, DECAY only matters as the fade after you let go.\n- ENV 1 attack 2 (14 ms): a softened start that takes the click off, still quicker than the 43 ms filter swell so the brightness arrives just after the note.\n- ENV 1 decay 4.5 (350 ms, release 270 ms): held notes do not fade; when you lift the key the note tails off over about a quarter of a second rather than stopping dead. Longer suits slow chords; shorter is tighter for stabs.\n- ENV 1 sustain 10 (100 %): full level for as long as the key is down, so long brass chords keep their weight.\n- Listen for: the end of each note. Short stabs finish with a gentle fall-off instead of a click; set ATTACK back to 0 and the front of each note gets a harder edge.',
        set: xm(1, { 'env1.attack': 2, 'env1.decay': 4.5, 'env1.sustain': 10 }) },
    ],
    context: {
      'xm1_vcf.modulation': 'In this sound: how far each note opens the filter. More gives a brighter, brassier bite.',
      'xm1_env2.attack': 'In this sound: how slowly the filter swells open. Shorter gives a harder “blat”.',
      'xm1_vco2.fine': 'In this sound: the slight detune that thickens the note.',
    },
    tweaks: [
      { id: 'xm1_vcf.modulation', try: 'Move between 1.5 and 4', hear: 'From a mellow horn to a bright, snarling brass.' },
      { id: 'xm1_vcf.notch', try: 'Turn slowly towards the centre while the riff plays', hear: 'The low end thins out as the filter moves towards a notch.' },
    ],
  },
  {
    id: 'notch-sweep', name: 'Notch Sweep', ref: 'The SEM’s own filter trick', artist: 'Oberheim SEM',
    tags: ['fx', 'experimental', '70s'], level: 1,
    blurb: 'A held chord whose tone is carved by a notch that sweeps slowly up and down.',
    how: 'The NOTCH knob at the centre turns the filter into a notch: it takes a slice out of the sound and keeps everything above and below. Each module’s LFO sweeps its own cutoff, so the notch moves through the harmonics like a slow phaser. DUO puts the two notes on separate modules, each with its own notch.',
    phrase: { bpm: 70, loop: true, steps: [[0, 48, 3.8], [0, 55, 3.8], [4, 46, 3.8], [4, 53, 3.8]] },
    steps: [
      { title: 'One note on each module', module: 'mode', why: 'The 2-XM is two complete synths, XM1 and XM2, side by side. This step switches the second one on and shares your notes between them, so a two-note chord becomes two separate voices.\n- ASSIGN DUO: decides how notes reach the two modules. DUO gives each new key to whichever module is free, so hold two keys and XM1 takes one, XM2 the other. UNI would put every note on both; SPLIT divides the keyboard at middle C.\n- XM2 level 7 (70 %): XM2 starts at 0, silent whatever its own panel does. At 7 it matches XM1.\n- Listen for: hold two keys. Both notes now sound, each a plain bright sawtooth from the modules’ starting settings. Pull XM2 level back to 0 and one of them disappears.',
        set: { 'alloc.assign': 'duo', ...xm(2, { level: 7 }) } },
      { title: 'Bright sawtooths into both filters', module: 'osc', why: 'Each module now gets two slightly detuned sawtooths. A notch filter can only take out harmonics that are there, and saws are full of them.\n- VCO 1 −4 (saw 80 %), VCO 2 −3 (saw 60 %): the VCOs (voltage-controlled oscillators) make the tone. The knobs for them in the VCF (voltage-controlled filter) section are silent at the centre, saw to the left, pulse to the right. VCO 1 leads and VCO 2 sits a little under it, on both modules.\n- VCO 2 fine tune +0.5 (+10 cents): a tenth of a semitone sharp on each module, so each note beats gently and sounds wider.\n- Listen for: a fuller, buzzier chord with a slow wobble on each note. Turn one module’s VCO 2 knob back to the centre to hear how much thickness it adds.',
        set: both({ 'vcf.mix_vco1': -4, 'vcf.mix_vco2': -3, 'vco2.fine': 0.5 }) },
      { title: 'NOTCH to the centre', module: 'filter', why: 'The SEM filter’s NOTCH knob sweeps smoothly from low-pass through notch to high-pass. At the centre it cuts a slice out of the sound and keeps everything above and below, which sounds hollow and phasey rather than darker.\n- NOTCH 0 (notch), both modules: fully left is low-pass, where it started; fully right is high-pass. Left of centre the sound goes darker, right of centre thinner.\n- VCF frequency 5.5 (843 Hz): where the notch sits. Around 840 Hz it scoops out the middle, leaving the low body and the top fizz.\n- VCF resonance 3.5 (35 %): makes the notch more pronounced and sharper. At 0 it is subtle.\n- Listen for: a hollow, scooped chord. Turn FREQUENCY slowly by hand and hear the notch move through the harmonics like a phaser. The next step does that for you.',
        set: both({ 'vcf.notch': 0, 'vcf.frequency': 5.5, 'vcf.resonance': 3.5 }) },
      { title: 'Sweep it with the LFO', module: 'lfo', why: 'An LFO (low-frequency oscillator) is a slow wave used to move a setting rather than to be heard. Here each module’s LFO sweeps its own cutoff, so the notch travels up and down by itself.\n- VCF modulation source LFO: the switch under the filter’s MODULATION knob picks what moves the cutoff. It starts at ENV 2, the filter envelope.\n- VCF modulation +2.8 (+2.9 oct): how far the LFO swings the cutoff, and the notch with it, nearly three octaves. Less gives a subtler sweep.\n- XM1 LFO 0.40 Hz, XM2 0.52 Hz: one sweep every two to two and a half seconds. The slightly different speeds let the two notches drift apart and back together.\n- Listen for: hold a chord and hear the hollow band move up and down, each note at its own pace. Turn one LFO faster and the slow phaser turns into a wobble.',
        set: { ...both({ 'vcf.mod_source': 'lfo', 'vcf.modulation': 2.8 }), ...xm(1, { 'lfo.rate': 2.2 }), ...xm(2, { 'lfo.rate': 2.6 }) } },
      { title: 'Long notes', module: 'amp', why: 'ENV 1 is the envelope that shapes loudness through the VCA (voltage-controlled amplifier). Set to hold, it keeps the chord sounding long enough to hear the notch make its full journey.\n- ENV 1 attack 3 (29 ms): a soft start, without the click of an instant attack.\n- ENV 1 decay 6 (1.0 s, release 800 ms): on the SEM, DECAY also sets the release. With full sustain it only acts after you let go, so chords fade over most of a second.\n- ENV 1 sustain 10 (100 %): held notes stay at full level, on both modules.\n- Listen for: the tail after you release the chord, with the notch still moving as it fades. Turn DECAY down and the chord stops short.',
        set: both({ 'env1.attack': 3, 'env1.decay': 6, 'env1.sustain': 10 }) },
    ],
    context: {
      'xm1_vcf.notch': 'In this sound: at the centre it is a notch. Turn it left and the sound goes darker (low-pass), right and it goes thinner (high-pass).',
      'xm1_lfo.rate': 'In this sound: how fast the notch sweeps.',
      'xm1_vcf.resonance': 'In this sound: how pronounced the notch sounds.',
    },
    tweaks: [
      { id: 'xm1_vcf.notch', try: 'Sweep from fully left to fully right by hand', hear: 'Low-pass, notch, high-pass: the SEM’s whole filter in one knob.' },
      { id: 'xm2_lfo.rate', try: 'Set to exactly the same as XM1 (2.2)', hear: 'The two notches move together and the chord sounds more like one instrument.' },
    ],
  },
  {
    id: 'duo-counterpoint', name: 'Two-Voice Counterpoint', ref: 'In the style of Kyle Dixon and Michael Stein — "Stranger Things" theme', artist: 'Kyle Dixon and Michael Stein',
    tags: ['seq', 'soundtrack', '10s'], level: 2,
    blurb: 'A plucked arpeggio and a held bass note, each on its own module and its own side of the stereo.',
    how: 'DUO gives each new key to the module that is free, so a held bass note stays on one module while the arpeggio moves on the other. Both modules have the same short, plucky filter envelope. Panning them apart makes the two parts easy to hear.',
    phrase: { bpm: 84, loop: true, steps: [[0, 36, 3.9], [0, 60, 0.45], [0.5, 64, 0.45], [1, 67, 0.45], [1.5, 71, 0.45], [2, 72, 0.45], [2.5, 71, 0.45], [3, 67, 0.45], [3.5, 64, 0.45]] },
    steps: [
      { title: 'DUO, both modules up', module: 'mode', why: 'The 2-XM is two synths in one, XM1 and XM2. DUO shares the keys between them, so a held bass note and a moving line play on separate modules, and panning puts each on its own side.\n- ASSIGN DUO: each new key goes to whichever module is free. Hold a bass note and it stays on its module while the next notes go to the other.\n- XM2 level 7 (70 %): XM2 starts at 0 and is silent until it is brought up.\n- XM1 pan −3, XM2 pan +3: 60 % towards the left and right. Two parts that sit apart are much easier to follow.\n- Listen for: hold one low key and play a few notes above it. The held note stays on one side and the moving notes come from the other.',
        set: { 'alloc.assign': 'duo', ...xm(1, { pan: -3 }), ...xm(2, { level: 7, pan: 3 }) } },
      { title: 'A pulse and a sawtooth', module: 'osc', why: 'Each module gets a narrow pulse on top and a sawtooth an octave below, set the same on both. The low saw gives body; the pulse gives a woody, reedy edge for the arpeggio.\n- VCO 1 into VCF +3.5 (pulse 70 %): VCO means voltage-controlled oscillator, the part that makes the tone. Its knob in the VCF (filter) section is silent at the centre; right of centre sends the pulse wave.\n- VCO 1 pulse width 35 %: narrower than a square (50 %), so it sounds thinner and more nasal than a hollow, clarinet-like square.\n- VCO 2 −2.5 (saw 50 %), FREQ 3 (−12 st): a quieter saw, an octave down. On FREQUENCY two numbers is an octave, and 5 is the starting pitch.\n- Listen for: a fuller, lower note with a reedy buzz on top. Turn VCO 2’s knob to the centre and the note loses its bottom octave.',
        set: both({ 'vcf.mix_vco1': 3.5, 'vcf.mix_vco2': -2.5, 'vco2.coarse': 3, 'vco1.pulse_width': 35 }) },
      { title: 'Pluck the filters', module: 'filter', why: 'The VCF (voltage-controlled filter) sets the brightness, and ENV 2, the second envelope, flicks it open on every note. With no sustain, each note starts bright and closes straight away: a pluck.\n- FREQ 3.2 (176 Hz), RES 4: a dark low-pass resting point, with enough resonance to give the pluck a round, rubbery edge.\n- VCF modulation +3 (+3.3 oct): how far ENV 2 opens the cutoff at the start of each note. More is a brighter, snappier pluck; less is duller.\n- ENV 2 A 3 ms, D 280 ms, S 0: opens at once, closes again in about a quarter of a second, holds nothing. DECAY sets the pluck length; longer turns it into a “wow”.\n- Listen for: a bright “tick” on each note that falls to a dull thud. Play the arpeggio and sweep ENV 2 decay on both modules to lengthen and shorten the pluck.',
        set: both({ 'vcf.frequency': 3.2, 'vcf.resonance': 4, 'vcf.modulation': 3, 'env2.attack': 0, 'env2.decay': 4.2, 'env2.sustain': 0 }) },
      { title: 'Let the notes ring a little', module: 'amp', why: 'ENV 1 sets the loudness of each note through the VCA (voltage-controlled amplifier). The filter has closed by now, but the volume carries on, so the held bass keeps sounding as a dark tone under the arpeggio.\n- ENV 1 decay 5 (500 ms, release 390 ms): after the attack the level falls over half a second to the sustain level. On the SEM, DECAY also sets how long a note takes to die away after you let go.\n- ENV 1 sustain 7 (70 %): held notes stay at 70 %, so the bass keeps its place under the moving line. At 0 it would die away by itself.\n- Listen for: the held bass carrying on, a little quieter after its attack, and arpeggio notes trailing off over a few hundred milliseconds when released rather than cutting dead.',
        set: both({ 'env1.decay': 5, 'env1.sustain': 7 }) },
    ],
    context: {
      'alloc.assign': 'In this sound: DUO is what lets the held bass and the moving arpeggio play on separate modules.',
      'xm1_env2.decay': 'In this sound: the length of the pluck.',
      'xm2.pan': 'In this sound: puts XM2 on the right, so the two parts separate.',
    },
    tweaks: [
      { id: 'alloc.assign', try: 'Switch to UNI', hear: 'XM1 takes each new note and drops back to the bass in the gaps, while XM2 holds the bass.' },
      { id: 'xm1_vcf.resonance', try: 'Raise to 7', hear: 'Each pluck rings with a glassy, vocal edge.' },
    ],
  },
  {
    id: 'split-bass-lead', name: 'Split Bass and Lead', ref: 'In the style of a 1970s funk keyboard split', artist: 'Oberheim Two Voice',
    tags: ['bass', 'funk', '70s'], level: 2,
    blurb: 'A punchy bass under the left hand and a singing, gliding lead under the right.',
    how: 'SPLIT sends keys below middle C to XM1 and the rest to XM2, so the two modules become two instruments. XM1 is a short, dark bass; XM2 is a brighter lead with portamento. The Two Voice was often played this way, one hand on each module.',
    phrase: { bpm: 100, loop: true, steps: [[0, 36, 0.4], [0.5, 36, 0.3], [1, 48, 0.4], [1.5, 43, 0.4], [0, 72, 1.4], [1.5, 74, 0.45], [2, 36, 0.4], [2.5, 39, 0.4], [3, 41, 0.4], [3.5, 43, 0.4], [2, 76, 1.9]] },
    steps: [
      { title: 'Split the keyboard', module: 'mode', why: 'SPLIT turns the 2-XM’s two modules into two instruments on one keyboard: XM1 under the left hand, XM2 under the right.\n- ASSIGN SPLIT: keys below middle C play XM1, the rest play XM2. UNI puts both modules on every note and DUO shares them out as you play.\n- XM2 level 6.5 (65 %): XM2 starts at 0; at 6.5 it sits just under XM1, which stays at 7.\n- Listen for: play low, then high. Both halves sound the same for now, the plain starting sawtooth, until the next two steps give each its own sound.',
        set: { 'alloc.assign': 'split', ...xm(2, { level: 6.5 }) } },
      { title: 'XM1: a round bass', module: 'osc', why: 'XM1 becomes the bass: a sawtooth with a pulse an octave under it, through a dark filter that snaps open on each note, and a volume that dips once the note has hit.\n- VCO 1 saw 80 %, VCO 2 pulse 60 %: the VCOs (voltage-controlled oscillators) are mixed by their knobs in the VCF section, saw to the left, pulse to the right. The saw gives bite, the pulse body.\n- VCO 2 frequency 3 (−12 st): an octave down, for weight in the low end.\n- FREQ 3 (154 Hz), RES 3: the VCF (filter) sits low in low-pass, so the bass is dark and round.\n- VCF MOD +3.3 oct, ENV 2 D 210 ms, S 0: ENV 2, the filter envelope, flicks the cutoff up and back down in about a fifth of a second. That is the punch.\n- ENV 1 D 170 ms, S 60 %: ENV 1, the loudness envelope, drops to 60 % after the hit and releases in 130 ms, so notes stay tight.\n- Listen for: a short “dow” on each low note. Lengthen ENV 2 decay to hear it turn into a slower “wow”.',
        set: xm(1, { 'vcf.mix_vco1': -4, 'vcf.mix_vco2': 3, 'vco2.coarse': 3, 'vcf.frequency': 3, 'vcf.resonance': 3, 'vcf.modulation': 3, 'env2.decay': 3.8, 'env2.sustain': 0, 'env1.decay': 3.5, 'env1.sustain': 6 }) },
      { title: 'XM2: a gliding lead', module: 'osc', why: 'XM2 becomes the lead: two sawtooths a fifth apart, a fairly open filter, and a glide between notes.\n- VCO 1 saw 80 %, VCO 2 saw 50 %: both as saws, VCO 2 quieter so it colours rather than doubles.\n- VCO 2 frequency 6.2 (+7 st): a fifth up, so every note sounds as an open interval, a classic fusion lead colour.\n- FREQ 6.5 (1.7 kHz), MOD +1.5 (+1.2 oct): fairly bright, with ENV 2 adding a little extra brightness at the start of each note.\n- ENV 2 decay 5 (500 ms): the brightness settles over half a second to ENV 2’s sustain level, still at its starting 40 %.\n- ON, XM2 PORTAMENTO 3.5 (370 ms): the switch turns glide on for both modules and each module’s knob sets its own time. XM1’s stays at 0, so the bass does not slide.\n- Listen for: play two notes above middle C in turn and hear the pitch slide between them over about a third of a second.',
        set: { ...xm(2, { 'vcf.mix_vco1': -4, 'vcf.mix_vco2': -2.5, 'vco2.coarse': 6.17, 'vcf.frequency': 6.5, 'vcf.modulation': 1.5, 'env2.decay': 5, portamento: 3.5 }), 'alloc.portamento_on': true } },
      { title: 'Vibrato on the lead', module: 'lfo', why: 'XM2’s LFO (low-frequency oscillator, a slow wave that moves a setting) adds vibrato to the lead only. XM1 has its own LFO, which is not used, so the bass stays steady.\n- XM2 VCO 1 modulation −0.9 (FM +0.8 st): left of centre is FREQ, pitch modulation (FM on the chip means frequency modulation). A touch left gives a gentle vibrato; further left gets seasick. Right of centre would move pulse width instead.\n- XM2 VCO 1 modulation source LFO: the switch under the knob. It starts at ENV 1.\n- XM2 LFO rate 5.8 (3.89 Hz): about four wobbles a second, a natural singing speed.\n- Listen for: hold a lead note and hear the pitch waver while the bass below stays still. Only VCO 1 moves; VCO 2’s fifth holds steady underneath.',
        set: xm(2, { 'vco1.modulation': -0.9, 'vco1.mod_source': 'lfo', 'lfo.rate': 5.8 }) },
    ],
    context: {
      'alloc.assign': 'In this sound: SPLIT turns the two modules into two instruments.',
      'xm2_pitch.portamento': 'In this sound: how slowly the lead slides between notes. The bass does not glide, because XM1’s PORTAMENTO is at 0.',
      'xm2_vco1.modulation': 'In this sound: the depth of the lead’s vibrato.',
    },
    tweaks: [
      { id: 'xm2_pitch.portamento', try: 'Raise to 6', hear: 'The lead swoops between notes.' },
      { id: 'xm1_vcf.frequency', try: 'Move between 2 and 5', hear: 'From a dull thud to a buzzy, funky bass.' },
    ],
  },
  {
    id: 'unison-lead', name: 'Four-Oscillator Lead', ref: 'In the style of 1970s jazz-fusion synth leads', artist: 'Oberheim Two Voice',
    tags: ['lead', 'fusion', '70s'], level: 1,
    blurb: 'A huge, gliding mono lead: four oscillators on every note, spread across the stereo.',
    how: 'UNI plays each note on both modules, so four oscillators sound at once. Detuning them slightly against each other, and panning the modules apart, gives a wide, moving tone. Portamento on both makes the line slide.',
    phrase: { bpm: 112, loop: true, steps: [[0, 64, 0.45], [0.5, 67, 0.45], [1, 69, 0.9], [2, 72, 0.45], [2.5, 71, 0.45], [3, 67, 0.9]] },
    steps: [
      { title: 'Both modules on every note', module: 'mode', why: 'UNI plays every note on both modules at once, so each note gets four oscillators: two from XM1 and two from XM2. Panning the modules apart makes the lead wide.\n- ASSIGN UNI: both modules play each note. It is where the switch starts; a second held key would go to XM2 alone.\n- XM2 level 7 (70 %): up from 0, so XM2 is now heard, matching XM1.\n- XM1 pan −2.5, XM2 pan +2.5: each module 50 % to its side.\n- Listen for: the note getting louder and a little wider. Both modules are still on their starting settings, so for now the width comes mostly from the pan.',
        set: { 'alloc.assign': 'unison', ...xm(1, { pan: -2.5 }), ...xm(2, { level: 7, pan: 2.5 }) } },
      { title: 'Four sawtooths, all slightly apart', module: 'osc', why: 'All four VCOs (voltage-controlled oscillators) go in as sawtooths, each tuned slightly differently. Four saws beating against each other give the thick, moving tone of a big unison lead.\n- VCO 1 and VCO 2 −4 (saw 80 %): the knobs in the VCF (filter) section, silent at the centre, saw to the left.\n- XM1 VCO 2 fine +0.5 (+10 cents): XM1’s pair beats slowly.\n- XM2 fine −8 and +18 cents: XM2’s pair sits either side of XM1, one flat and one sharper. The spread across four pitches is the width; with the pan it also moves between the speakers.\n- Listen for: a thick, chorused note that swirls from side to side. Pull XM2 level to 0 and the lead goes half as thick.',
        set: { ...both({ 'vcf.mix_vco1': -4, 'vcf.mix_vco2': -4 }), ...xm(1, { 'vco2.fine': 0.5 }), ...xm(2, { 'vco1.fine': -0.4, 'vco2.fine': 0.9 }) } },
      { title: 'A bright filter with a push', module: 'filter', why: 'The VCF (voltage-controlled filter) takes some fizz off the four saws but stays fairly open, and ENV 2, the filter envelope, adds a push of extra brightness at the start of each note.\n- VCF frequency 6.4 (1.6 kHz): low-pass, bright enough to cut through a mix, with the harshest top trimmed.\n- VCF resonance 2.5 (25 %): a small lift at the cutoff that makes the tone slightly vocal.\n- VCF MOD +1.8 (+1.5 oct), ENV 2 D 500 ms: each note opens an octave and a half higher and settles over half a second to ENV 2’s sustain, still at its starting 40 %.\n- Listen for: a brighter front on each note, then a steadier tone. Set VCF modulation to 0 on both modules and the attacks lose their push.',
        set: both({ 'vcf.frequency': 6.4, 'vcf.resonance': 2.5, 'vcf.modulation': 1.8, 'env2.decay': 5 }) },
      { title: 'Glide', module: 'glide', why: 'Portamento makes the pitch slide from one note to the next instead of jumping. The same time on both modules keeps all four oscillators sliding together.\n- Portamento ON: the master switch for both modules’ glide.\n- XM1 and XM2 portamento 3 (270 ms): about a quarter of a second per slide. Longer is more dramatic; shorter is barely a scoop.\n- Listen for: play a leap and hear the lead slide up to it. Set XM2’s portamento a little longer than XM1’s and the two halves arrive at different moments, which smears the note.',
        set: { 'alloc.portamento_on': true, ...both({ portamento: 3 }) } },
    ],
    context: {
      'xm2.level': 'In this sound: brings in the second pair of oscillators. At 0 the lead is half as thick.',
      'xm2_vco1.fine': 'In this sound: detunes XM2 against XM1, which is what makes the lead sound wide.',
    },
    tweaks: [
      { id: 'xm2_pitch.portamento', try: 'Set to 6 while XM1 stays at 3', hear: 'The two modules slide at different speeds and the note smears on every change.' },
      { id: 'xm2.pan', try: 'Turn fully right, and XM1 PAN fully left', hear: 'The lead splits into two voices across the stereo.' },
    ],
  },
  {
    id: 'sync-tear', name: 'Sync Tear', ref: 'In the style of late-1970s synth-rock sync leads', artist: 'Oberheim SEM',
    tags: ['lead', 'rock', '70s'], level: 2,
    blurb: 'A lead whose tone tears downwards at the start of every note.',
    how: 'SYNC locks VCO 2 to VCO 1, so VCO 2’s pitch changes its tone, not its note. VCO 2’s MODULATION, turned left with ENV 2 as its source, pushes VCO 2 up at the start of each note and lets it fall back, which sweeps the tone: the classic sync tear.',
    phrase: { bpm: 120, loop: true, steps: [[0, 60, 0.45], [0.5, 63, 0.45], [1, 65, 0.9], [2, 67, 0.45], [2.5, 70, 0.45], [3, 67, 0.9]] },
    steps: [
      { title: 'Only VCO 2, synced', module: 'osc', why: 'Only XM1 plays here, and only VCO 2, locked to VCO 1 with hard sync. That lets VCO 2’s tuning knob change the tone of the note instead of its pitch.\n- VCO 1 into VCF 0 (off): VCO means voltage-controlled oscillator. VCO 1’s knob in the VCF (filter) section goes to the centre, which is silent. VCO 1 still runs and drives the sync; it just is not heard.\n- VCO 2 into VCF −4.5 (saw 90 %): VCO 2 in as a sawtooth.\n- VCO 2 sync On: VCO 2 restarts every time VCO 1 does, so the note follows VCO 1’s pitch.\n- VCO 2 frequency 6.5 (+9 st): tuned above VCO 1, which adds a harsh, nasal peak to the tone rather than raising the note.\n- Listen for: turn VCO 2 FREQUENCY slowly while holding a note. The pitch stays put while the tone snarls and tears.',
        set: xm(1, { 'vcf.mix_vco1': 0, 'vcf.mix_vco2': -4.5, 'vco2.sync': true, 'vco2.coarse': 6.5 }) },
      { title: 'Sweep VCO 2 with ENV 2', module: 'mod', why: 'ENV 2, XM1’s second envelope, now bends VCO 2’s pitch on every note. Under sync that sweep is heard as the tone tearing down from a scream to the steadier tone set in step 1.\n- VCO 2 modulation −3.2 (FM +9.8 st): left of centre moves pitch (FREQ; FM means frequency modulation). At the start of each note VCO 2 is pushed nearly ten semitones higher. Further left is a longer, more dramatic tear; right of centre would move pulse width instead.\n- VCO 2 modulation source ENV 2: the switch under the knob. It can also be E+V (the envelope scaled by how hard you play) or the LFO.\n- ENV 2 A 0, D 720 ms, S 15 %: an instant jump, then a fall over most of a second to just above the resting tone. DECAY sets how long the tear takes.\n- Listen for: a “neeow” on each note. Short decays give a bark; long ones a slow, sweeping snarl.',
        set: xm(1, { 'vco2.modulation': -3.2, 'vco2.mod_source': 'env2', 'env2.attack': 0, 'env2.decay': 5.5, 'env2.sustain': 1.5 }) },
      { title: 'Open filter', module: 'filter', why: 'The sweep is the sound, so the VCF (voltage-controlled filter) stays fairly open and only takes the harshest top off. Its MODULATION is still at the centre, so nothing moves the cutoff.\n- VCF frequency 7 (2.3 kHz): the cutoff, in low-pass. It starts at 8 (4.6 kHz); bringing it down a notch softens the fizz. Much lower and the tear gets muffled.\n- VCF resonance 1.5 (15 %): a slight lift at the cutoff for a touch of edge.\n- Listen for: the tear still clear but less brittle. Pull FREQUENCY down to 4 to hear how much of the effect lives in the upper harmonics.',
        set: xm(1, { 'vcf.frequency': 7, 'vcf.resonance': 1.5 }) },
    ],
    context: {
      'xm1_vco2.modulation': 'In this sound: the depth of the tear. Further left is a longer, more dramatic sweep.',
      'xm1_env2.decay': 'In this sound: how long the tear takes.',
      'xm1_vco2.coarse': 'In this sound: the tone the sweep settles on.',
    },
    tweaks: [
      { id: 'xm1_vco2.coarse', try: 'Turn slowly while holding a note', hear: 'The sync sweep done by hand.' },
      { id: 'xm1_env2.decay', try: 'Set between 4 and 7', hear: 'A short zap at 4, a slow vowel at 7.' },
    ],
  },
];

const init = Object.fromEntries(controls.map((c) => [c.id, c.def]));

export default {
  id: '2-xm', name: '2-XM', maker: 'Behringer', year: 2025,
  heritage: 'Based on the 1975 Oberheim Two Voice',
  summary: 'Two complete SEM voices side by side. Each has two VCOs crossfaded into a 12 dB filter that sweeps from low-pass through notch to high-pass (or band-pass), two ADS envelopes, an LFO and a VCA, with its own 16-jack patchbay. The master section sets each module’s level and pan and plays them in unison, split or duo.',
  view: { w: 2000, h: 626 },
  theme: { panel: PANEL, panel2: '#ede6cd', ink: INK, font: 'din', weight: 500, cheeks: 'wood', cheekW: 38, jack: 'black' },
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds], lineage,
  signalNames: {
    osc1: 'VCO 1', osc2: 'VCO 2', osc3: 'the 440 Hz tuning tone', o1saw: 'the VCO 1 output', o2saw: 'the VCO 2 output',
    env1: 'ENV 1', env2: 'ENV 2', env1v: 'ENV 1 scaled by velocity', env2v: 'ENV 2 scaled by velocity', lfo: 'the LFO',
    vcf1: 'the VCF output', vca: 'the VCA output', kbd: 'the module’s MIDI pitch (its CV output)', gate: 'the module’s MIDI gate',
    mult: 'the VCO 1 CV input', mixer: 'the filter inputs',
  },
  destNames: { pitch1: 'VCO 1 pitch', pitch2: 'VCO 2 pitch', pw1: 'VCO 1 pulse width', pw2: 'VCO 2 pulse width', cutoff: 'the VCF cutoff', amp: 'the VCA' },
};
