// Moog 900-series modular (EngineParams `moog`, see CONTRACT.md): a sound path of separate modules with nothing wired
// between them, run by dsp-core.js in place of its fixed voice. Every signal is a voltage, in volts: control voltages
// are 1 V per octave, envelopes rise to +6 V, audio swings about ±5 V. Every connection is a cable (a route into one of
// the destinations below), so nothing is heard until a patch reaches the output.
//
// Modules come in numbered slots, sized to the largest system (the System 55); a smaller system uses the first few.
// A slot whose outputs no cable reads is not run at all.

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
export const MOOG_SLOTS = { vco: 7, drv: 2, vca: 5, env: 4, mix: 3, mult: 10, ctl: 4 };

/** Signals (outputs), all in volts. */
export const MOOG_SIGNALS = [
  // 921B / 921 oscillators: four waveforms, the 921's AUX output, and a 921B's two link thru jacks
  ...range(MOOG_SLOTS.vco).flatMap((n) => ['sin', 'tri', 'saw', 'rect', 'aux', 'lft', 'lwt'].map((w) => `v${n}${w}`)),
  // 921A oscillator drivers: the frequency and width link voltages
  ...range(MOOG_SLOTS.drv).flatMap((n) => [`d${n}f`, `d${n}w`]),
  'lp904', 'hp904', 'fb914', 'lp923', 'hp923', 'white', 'pink',
  ...range(MOOG_SLOTS.vca).flatMap((n) => [`a${n}p`, `a${n}n`]),
  ...range(MOOG_SLOTS.env).map((n) => `e${n}`),
  ...range(MOOG_SLOTS.mix).flatMap((n) => [`x${n}p`, `x${n}n`]),
  ...range(MOOG_SLOTS.mult).map((n) => `mu${n}`),
  // CP3A-O oscillator controllers and the 992 control voltages: switched control inputs summed with an attenuated EXT INPUT
  ...range(MOOG_SLOTS.ctl).map((n) => `c${n}`),
  't1', 't2', 't3', 't4', 'p6', 'n6',
  // 961 interface: audio → V-trig, S-trig → V-trig (left, right), V-trig → S-trig (left, right)
  'i9a', 'i9vL', 'i9vR', 'i9sL', 'i9sR',
  // CM1A MIDI to CV: two pitch CVs and the upper and lower trigger outputs
  'kcv1', 'kcv2', 'ktrU', 'ktrL',
  // 960 sequencer: rows A, B, C, its clock, and the eight stage outputs; 962 switch output and stage outputs;
  // 911A delayed S-triggers; 995 attenuators
  's960a', 's960b', 's960c', 's960clk', ...range(8).map((n) => `s960o${n}`),
  'sw962', 'sw962t1', 'sw962t2', 'sw962t3', 'dtO1', 'dtO2', ...range(6).map((n) => `q${n}`),
];

/** Destinations (inputs), all in volts. */
export const MOOG_DESTS = [
  // link frequency, link width, DC mod (and the 921's frequency inputs), AC mod, sync, the 921's width CV and clamp triggers
  ...range(MOOG_SLOTS.vco).flatMap((n) => ['lf', 'lw', 'dc', 'ac', 'sy', 'wc', 'tv', 'ts'].map((w) => `v${n}${w}`)),
  ...range(MOOG_SLOTS.drv).flatMap((n) => [`d${n}fi`, `d${n}wi`]),
  'lp904In', 'lp904Cv', 'hp904In', 'hp904Cv', 'fb914In', 'lp923In', 'hp923In',
  ...range(MOOG_SLOTS.vca).flatMap((n) => [`a${n}ip`, `a${n}in`, `a${n}cv`]),
  ...range(MOOG_SLOTS.env).map((n) => `e${n}st`),
  ...range(MOOG_SLOTS.mix).flatMap((n) => [1, 2, 3, 4].map((k) => `x${n}i${k}`)),
  ...range(MOOG_SLOTS.mult).map((n) => `mu${n}In`),
  ...range(MOOG_SLOTS.ctl).flatMap((n) => [`c${n}i1`, `c${n}i2`, `c${n}i3`, `c${n}x`]),
  't1In', 't2In', 't3In', 't4In',
  'i9au', 'i9siL', 'i9siR', 'i9aL', 'i9bL', 'i9aR', 'i9bR',
  's960on', 's960off', 's960cv', 's960sh', ...range(8).map((n) => `s960i${n}`),
  'sw962i1', 'sw962i2', 'sw962i3', 'sw962sh', 'sw962s1', 'sw962s2', 'sw962s3', 'dtI1', 'dtI2', ...range(6).map((n) => `q${n}In`),
];

/** Trigger levels. A V-trigger is +5 V while on. An S-trigger idles high and is pulled to 0 V while on. */
export const TRIG_HI = 5;
const TWO_PI = Math.PI * 2;
// 914 fixed filter bank: low-pass, twelve band-passes, high-pass
export const BANDS_914 = [125, 175, 250, 350, 500, 700, 1000, 1400, 2000, 2800, 4000, 5600];

/**
 * `S` / `SI` / `DI` / `ev` / `cabled` are the voice's signal array, the name → index maps, its routing evaluator and the
 * cabled-destination flags (see dsp-core.js), shared so cables between the modules and the output stage just work.
 */
export function createMoog(sr, S, SI, DI, ev, cabled) {
  const sm = 1 - Math.exp(-1 / (0.004 * sr));
  const blep = (t, dt) => {
    if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
    if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
    return 0;
  };
  const sig = (name) => SI[name];
  const dst = (name) => DI[name];

  // ── state per slot ──
  const vco = range(MOOG_SLOTS.vco).map((n) => ({
    on: false, phase: Math.random(), semi: 0, semiT: 0, acLp: 0, syPrev: 0, tvPrev: 0, tsPrev: TRIG_HI,
    o: ['sin', 'tri', 'saw', 'rect', 'aux', 'lft', 'lwt'].map((w) => sig(`v${n}${w}`)),
    d: ['lf', 'lw', 'dc', 'ac', 'sy', 'wc', 'tv', 'ts'].map((w) => dst(`v${n}${w}`)),
    p: null,
  }));
  const drv = range(MOOG_SLOTS.drv).map((n) => ({ f: 0, fT: 0, w: 0, wT: 0, o: [sig(`d${n}f`), sig(`d${n}w`)], d: [dst(`d${n}fi`), dst(`d${n}wi`)], on: false }));
  const vca = range(MOOG_SLOTS.vca).map((n) => ({ on: false, v: 0, vT: 0, exp: false, o: [sig(`a${n}p`), sig(`a${n}n`)], d: [dst(`a${n}ip`), dst(`a${n}in`), dst(`a${n}cv`)] }));
  const env = range(MOOG_SLOTS.env).map((n) => ({ on: false, stage: 0, level: 0, ca: 0, cd: 0, cr: 0, sus: 0, o: sig(`e${n}`), d: dst(`e${n}st`) }));
  const mix = range(MOOG_SLOTS.mix).map((n) => ({ on: false, g: new Float64Array(4), gT: new Float64Array(4), o: [sig(`x${n}p`), sig(`x${n}n`)], d: [1, 2, 3, 4].map((k) => dst(`x${n}i${k}`)) }));
  const ctl = range(MOOG_SLOTS.ctl).map((n) => ({ on: [0, 0, 0], x: 0, xT: 0, o: sig(`c${n}`), d: [1, 2, 3].map((k) => dst(`c${n}i${k}`)), dx: dst(`c${n}x`) }));
  const mults = range(MOOG_SLOTS.mult).map((n) => [sig(`mu${n}`), dst(`mu${n}In`)]);
  const att = { g: new Float64Array(4), gT: new Float64Array(4), o: [1, 2, 3, 4].map((k) => sig(`t${k}`)), d: [1, 2, 3, 4].map((k) => dst(`t${k}In`)) };
  // 904A ladder and 904B high-pass: four one-pole stages each, two steps per sample
  const lp = { on: false, s: new Float64Array(4), prev: 0, lo: 4, v: 0, vT: 0, res: 0, resT: 0 };
  const hp = { on: false, s: new Float64Array(4), prev: 0, lo: 4, v: 0, vT: 0 };
  // 914: fourteen state-variable filters in parallel, fixed frequencies, one level each
  const fb = { on: false, ic1: new Float64Array(14), ic2: new Float64Array(14), a1: new Float64Array(14), a2: new Float64Array(14),
    a3: new Float64Array(14), k: new Float64Array(14), g: new Float64Array(14), gT: new Float64Array(14) };
  const f923 = { lpOn: false, hpOn: false, lpY: 0, hpY: 0, cLp: 0, cHp: 0 };
  let pinkB0 = 0, pinkB1 = 0, pinkB2 = 0;
  const i961 = { on: false, sens: 0, onL: 0.5, onR: 0.5, follow: 0, aHold: 0, bL: 0, bR: 0, bLPrev: 0, bRPrev: 0 };
  let trigMode = 's';
  // 960 sequencer: running, current stage (0-based), clock phase, and the last values of the inputs and panel buttons
  const sq = { on: false, run: false, st: 0, ph: 0, hz: 1, p: null, prevOn: 0, prevOff: 0, prevSh: 0, prevIn: new Float64Array(8), btn: null };
  // 962 sequential switch, 911A trigger delay, 995 attenuators
  const sw = { on: false, st: 0, prevSh: 0, prevS: new Float64Array(3), btn: null };
  const dt = { on: false, d: [0.5, 0.5], mode: 'off', t: [0, 0], outOn: [false, false] };
  const q995 = new Float64Array(6), q995T = new Float64Array(6);
  let q995On = false;
  // signal and destination indexes, looked up once
  const Q_O = range(6).map((n) => SI[`q${n}`]), Q_D = range(6).map((n) => DI[`q${n}In`]);
  const S960_I = range(8).map((n) => DI[`s960i${n}`]), S960_O = range(8).map((n) => SI[`s960o${n}`]);
  const SW_S = range(3).map((n) => DI[`sw962s${n}`]), SW_I = range(3).map((n) => DI[`sw962i${n}`]), SW_T = range(3).map((n) => SI[`sw962t${n}`]);

  /** A one-pole coefficient for a cutoff in Hz. */
  const onePole = (hz) => 1 - Math.exp((-TWO_PI * Math.min(hz, sr * 0.45)) / sr);
  /** Envelope time constant: the 911's times are how long a stage takes to (nearly) finish. */
  const tc = (t) => 1 - Math.exp(-1 / (Math.max(t, 0.0005) * sr / 4));

  function svfSet(i, hz, q) {
    const g = Math.tan((Math.PI * Math.min(hz, sr * 0.45)) / sr);
    const k = 1 / q;
    fb.a1[i] = 1 / (1 + g * (g + k)); fb.a2[i] = g * fb.a1[i]; fb.a3[i] = g * fb.a2[i]; fb.k[i] = k;
  }

  /** `m` = EngineParams `moog`; `used` = the set of signal names some cable reads. */
  function set(m, used) {
    const uses = (prefix) => { for (const u of used) if (u.startsWith(prefix)) return true; return false; };
    m.vco.forEach((q, i) => {
      const o = vco[i];
      if (!o) return;
      o.p = q || null;
      o.on = !!q && uses(`v${i + 1}`);
      if (q) { o.semiT = q.semi; if (!o.init) { o.semi = o.semiT; o.init = true; } }
    });
    (m.drv || []).forEach((q, i) => { const d = drv[i]; if (!d || !q) return; d.on = true; d.fT = q.v; d.wT = q.w; });
    (m.vca || []).forEach((q, i) => { const a = vca[i]; if (!a || !q) return; a.on = uses(`a${i + 1}`); a.vT = q.v; a.exp = !!q.exp; });
    (m.env || []).forEach((q, i) => {
      const e = env[i];
      if (!e || !q) return;
      e.on = uses(`e${i + 1}`);
      e.ca = tc(q.t1 / 1.2); e.cd = tc(q.t2); e.cr = tc(q.t3); e.sus = q.sus;
    });
    (m.mix || []).forEach((q, i) => { const x = mix[i]; if (!x || !q) return; x.on = uses(`x${i + 1}`); for (let k = 0; k < 4; k++) x.gT[k] = q.g[k] * q.m; });
    if (m.att) for (let k = 0; k < 4; k++) att.gT[k] = m.att[k];
    (m.ctl || []).forEach((q, i) => { const c = ctl[i]; if (!c || !q) return; c.on = q.on.map((b) => (b ? 1 : 0)); c.xT = q.x; c.run = uses(`c${i + 1}`); });
    if (m.lp904) { lp.on = used.has('lp904'); lp.lo = m.lp904.lo; lp.vT = m.lp904.v; lp.resT = m.lp904.regen; }
    if (m.hp904) { hp.on = used.has('hp904'); hp.lo = m.hp904.lo; hp.vT = m.hp904.v; }
    if (m.fb914) {
      fb.on = used.has('fb914');
      svfSet(0, 100, 0.7);
      BANDS_914.forEach((hz, k) => svfSet(k + 1, hz, 5));
      svfSet(13, 7000, 0.7);
      for (let k = 0; k < 14; k++) fb.gT[k] = m.fb914.g[k];
    }
    if (m.f923) {
      f923.lpOn = used.has('lp923'); f923.hpOn = used.has('hp923');
      f923.cLp = onePole(m.f923.lp); f923.cHp = onePole(m.f923.hp);
    }
    if (m.i961) { i961.on = uses('i9'); i961.sens = m.i961.sens; i961.onL = m.i961.onL; i961.onR = m.i961.onR; }
    trigMode = (m.cm1a && m.cm1a.trig) || 's';
    if (m.s960) {
      const q = m.s960;
      sq.on = uses('s960');
      // panel buttons are toggles in the app: any change of one is a press
      const b = q.btn;
      if (sq.btn) {
        if (b.on !== sq.btn.on) sq.run = true;
        if (b.off !== sq.btn.off) sq.run = false;
        if (b.shift !== sq.btn.shift) advance960();
        for (let k = 0; k < 8; k++) if (b.set[k] !== sq.btn.set[k]) sq.st = k;
      } else sq.run = true; // the clock starts running as soon as the 960 is patched
      sq.btn = { on: b.on, off: b.off, shift: b.shift, set: b.set.slice() };
      sq.p = q;
    }
    if (m.s962) {
      sw.on = uses('sw962');
      const b = m.s962.btn;
      if (sw.btn) for (let k = 0; k < 3; k++) if (b[k] !== sw.btn[k]) sw.st = k;
      sw.btn = b.slice();
    }
    if (m.d911a) { dt.on = uses('dtO'); dt.d = m.d911a.d; dt.mode = m.d911a.mode; }
    if (m.q995) for (let k = 0; k < 6; k++) q995T[k] = m.q995[k];
    q995On = !!m.q995 && uses('q');
  }
  /** Move the 960 on one stage, passing over SKIP stages; landing on a STOP stage stops the clock there. */
  function advance960() {
    const q = sq.p;
    if (!q) return;
    for (let k = 1; k <= 8; k++) {
      const n = (sq.st + k) % 8;
      if (q.mode[n] === 'skip') continue;
      sq.st = n;
      if (q.mode[n] === 'stop') sq.run = false;
      return;
    }
  }

  /** One ladder pass (2× oversampled), the 904A: x in volts, cutoff in Hz, res 0..1.1. */
  function ladder(x, hz, res) {
    const s = lp.s;
    const g = Math.tan((Math.PI * Math.min(Math.max(hz, 5), sr * 0.84)) / (sr * 2));
    const G = g / (1 + g), b = 1 / (1 + g), k4 = res * 4.1;
    const G2 = G * G, G3 = G2 * G, G4 = G3 * G;
    const comp = 1 + res * 1.1;
    let y4 = 0;
    for (let os = 0; os < 2; os++) {
      const xi = ((os ? x : (x + lp.prev) * 0.5) * 0.2 * comp + (Math.random() - 0.5) * 2e-5);
      const Sg = (G3 * s[0] + G2 * s[1] + G * s[2] + s[3]) * b;
      let u = Math.tanh((xi - k4 * Sg) / (1 + k4 * G4));
      let v = (u - s[0]) * G; const y1 = v + s[0]; s[0] = y1 + v;
      v = (y1 - s[1]) * G; const y2 = v + s[1]; s[1] = y2 + v;
      v = (y2 - s[2]) * G; const y3 = v + s[2]; s[2] = y3 + v;
      v = (y3 - s[3]) * G; y4 = v + s[3]; s[3] = y4 + v;
    }
    lp.prev = x;
    return y4 * 5 * 1.25;
  }
  /** The 904B: four one-pole high-pass stages (24 dB/oct), 2× oversampled. */
  function highpass(x, hz) {
    const s = hp.s;
    const c = 1 - Math.exp((-TWO_PI * Math.min(Math.max(hz, 2), sr * 0.84)) / (sr * 2));
    let y = 0;
    for (let os = 0; os < 2; os++) {
      y = os ? x : (x + hp.prev) * 0.5;
      for (let k = 0; k < 4; k++) { s[k] += (y - s[k]) * c; y -= s[k]; }
    }
    hp.prev = x;
    return y;
  }
  /** S-trigger input: on while something is plugged in and holds it low. */
  const sOn = (d) => cabled[d] && ev(d) < TRIG_HI / 2;

  /** One sample. `note` = the key pitch (MIDI, already glided), `gate` = a key is held. */
  function step(note, gate) {
    // ── CM1A: pitch CV (0 V at middle C, 1 V per octave) and the two trigger outputs ──
    const kv = (note - 60) / 12;
    S[SI.kcv1] = kv;
    S[SI.kcv2] = kv;
    const vt = gate ? TRIG_HI : 0, st = gate ? 0 : TRIG_HI;
    S[SI.ktrU] = trigMode === 'v' ? vt : st;
    S[SI.ktrL] = trigMode === 's' ? st : vt;
    S[SI.p6] = 6; S[SI.n6] = -6;

    // ── passive multiples, attenuators (half-normalled: each input feeds the ones below it until they are used) ──
    for (let k = 0; k < mults.length; k++) S[mults[k][0]] = ev(mults[k][1]);
    let a = 0;
    for (let k = 0; k < 4; k++) {
      att.g[k] += (att.gT[k] - att.g[k]) * sm;
      if (k === 0 || cabled[att.d[k]]) a = ev(att.d[k]);
      S[att.o[k]] = a * att.g[k];
    }

    // ── CP3A-O / 992 controllers: the switched-on control inputs plus the EXT INPUT through its attenuator ──
    for (let i = 0; i < ctl.length; i++) {
      const c = ctl[i];
      if (!c.run) continue;
      c.x += (c.xT - c.x) * sm;
      S[c.o] = c.on[0] * ev(c.d[0]) + c.on[1] * ev(c.d[1]) + c.on[2] * ev(c.d[2]) + c.x * ev(c.dx);
    }

    // ── 921A drivers: knob plus the summed control inputs ──
    for (let i = 0; i < drv.length; i++) {
      const d = drv[i];
      if (!d.on) continue;
      d.f += (d.fT - d.f) * sm; d.w += (d.wT - d.w) * sm;
      S[d.o[0]] = d.f + ev(d.d[0]);
      S[d.o[1]] = d.w + ev(d.d[1]);
    }

    // ── 921B / 921 oscillators ──
    for (let i = 0; i < vco.length; i++) {
      const o = vco[i];
      if (!o.on) continue;
      const q = o.p, D = o.d, O = o.o;
      o.semi += (o.semiT - o.semi) * sm;
      const lf = ev(D[0]);
      S[O[5]] = lf;
      const lwIn = ev(D[1]);
      S[O[6]] = lwIn;
      // AC MOD is capacitor-coupled: the input's own slow level is taken off
      let ac = 0;
      if (cabled[D[3]]) { const x = ev(D[3]); o.acLp += (x - o.acLp) * 0.0003; ac = x - o.acLp; }
      const volts = lf + ev(D[2]) + ac;
      let hz = 261.6256 * Math.exp((volts * 12 + o.semi) * (Math.LN2 / 12));
      if (hz > sr * 0.45) hz = sr * 0.45;
      const dt = hz / sr;
      let ph = o.phase + dt;
      if (ph >= 1) ph -= Math.floor(ph);
      // SYNC IN: a sharp fall in the input (the reset of a sawtooth) restarts the cycle. STRONG always; WEAK only
      // when this oscillator is already near the end of its own cycle, so it pulls into step rather than being reset.
      if (q.sync !== 'off' && cabled[D[4]]) {
        const sx = ev(D[4]);
        if (sx - o.syPrev < -3 && (q.sync === 'strong' || ph > 0.7)) ph = 0;
        o.syPrev = sx;
      }
      // the 921's clamping point: a trigger moves the waveform to that point of its cycle
      if (q.kind === '921') {
        const tv = ev(D[6]);
        const ts = cabled[D[7]] ? ev(D[7]) : TRIG_HI;
        if ((tv > 2.5 && o.tvPrev <= 2.5) || (ts < 2.5 && o.tsPrev >= 2.5)) ph = q.clamp;
        o.tvPrev = tv; o.tsPrev = ts;
      }
      o.phase = ph;
      let w;
      if (q.kind === '921') w = q.width + ev(D[5]) * 0.15;
      else w = cabled[D[1]] ? lwIn * 0.16 : 0.5;
      const saw = 2 * ph - 1 - blep(ph, dt);
      const tri = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
      const sine = Math.sin(TWO_PI * ph);
      let rect = 0;
      // outside about 0–96 % (0 to +6 V on the width link) the rectangular output stops
      if (w > 0.02 && w < 0.98) {
        let p2 = ph - w;
        if (p2 < 0) p2 += 1;
        rect = (ph < w ? 1 : -1) + blep(ph, dt) - blep(p2, dt) - (2 * w - 1);
      }
      S[O[0]] = sine * 5; S[O[1]] = tri * 5; S[O[2]] = saw * 5; S[O[3]] = rect * 5;
      if (q.kind === '921') {
        const aw = q.aux;
        const x = aw === 'sine' ? sine : aw === 'tri' ? tri : aw === 'saw' ? saw : aw === 'rsaw' ? -saw : aw === 'rect' ? rect : -rect;
        S[O[4]] = x * 5 * q.auxLevel;
      }
    }

    // ── noise (the 923's white and pink outputs) ──
    const white = Math.random() * 2 - 1;
    pinkB0 = 0.99765 * pinkB0 + white * 0.099046;
    pinkB1 = 0.963 * pinkB1 + white * 0.2965164;
    pinkB2 = 0.57 * pinkB2 + white * 1.0526913;
    S[SI.white] = white * 2.4;
    S[SI.pink] = (pinkB0 + pinkB1 + pinkB2 + white * 0.1848) * 0.28 * 3.4;

    // ── 911 envelopes: S-trigger held low → T1 up to the peak, T2 down to E SUS; let go → T3 down to 0 ──
    for (let i = 0; i < env.length; i++) {
      const e = env[i];
      if (!e.on) continue;
      const on = sOn(e.d);
      if (!on) e.stage = 0;
      else if (e.stage === 0) e.stage = 1;
      if (e.stage === 1) {
        e.level += (6.6 - e.level) * e.ca;
        if (e.level >= 6) { e.level = 6; e.stage = 2; }
      } else if (e.stage === 2) e.level += (e.sus - e.level) * e.cd;
      else e.level += (0 - e.level) * e.cr;
      S[e.o] = e.level;
    }

    // ── 902 amplifiers: gain from FIXED CONTROL VOLTAGE plus the control inputs, 6 V = unity ──
    for (let i = 0; i < vca.length; i++) {
      const v = vca[i];
      if (!v.on) continue;
      v.v += (v.vT - v.v) * sm;
      const cv = v.v + ev(v.d[2]);
      let g;
      if (v.exp) g = cv <= 0 ? 0 : Math.exp((cv - 6) * 1.38) * (cv < 1 ? cv : 1); // about 12 dB per volt
      else g = cv <= 0 ? 0 : cv / 6;
      if (g > 1.6) g = 1.6;
      const y = (ev(v.d[0]) - ev(v.d[1])) * g;
      S[v.o[0]] = y; S[v.o[1]] = -y;
    }

    // ── CP3A-M mixers ──
    for (let i = 0; i < mix.length; i++) {
      const x = mix[i];
      if (!x.on) continue;
      let y = 0;
      for (let k = 0; k < 4; k++) { x.g[k] += (x.gT[k] - x.g[k]) * sm; y += ev(x.d[k]) * x.g[k]; }
      y = 12 * Math.tanh(y / 12);
      S[x.o[0]] = y; S[x.o[1]] = -y;
    }

    // ── filters ──
    if (lp.on) {
      lp.v += (lp.vT - lp.v) * sm; lp.res += (lp.resT - lp.res) * sm;
      const hz = lp.lo * Math.exp((lp.v + 6 + ev(DI.lp904Cv)) * Math.LN2);
      S[SI.lp904] = ladder(ev(DI.lp904In), hz, lp.res);
    }
    if (hp.on) {
      hp.v += (hp.vT - hp.v) * sm;
      const hz = hp.lo * Math.exp((hp.v + 6 + ev(DI.hp904Cv)) * Math.LN2);
      S[SI.hp904] = highpass(ev(DI.hp904In), hz);
    }
    if (fb.on) {
      const x = ev(DI.fb914In);
      let y = 0;
      for (let k = 0; k < 14; k++) {
        fb.g[k] += (fb.gT[k] - fb.g[k]) * sm;
        const v3 = x - fb.ic2[k];
        const bp = fb.a1[k] * fb.ic1[k] + fb.a2[k] * v3;
        const lo = fb.ic2[k] + fb.a2[k] * fb.ic1[k] + fb.a3[k] * v3;
        fb.ic1[k] = 2 * bp - fb.ic1[k]; fb.ic2[k] = 2 * lo - fb.ic2[k];
        if (fb.g[k] < 1e-4) continue;
        const out = k === 0 ? lo : k === 13 ? x - fb.k[k] * bp - lo : bp * fb.k[k];
        y += out * fb.g[k];
      }
      S[SI.fb914] = y;
    }
    if (f923.lpOn) { f923.lpY += (ev(DI.lp923In) - f923.lpY) * f923.cLp; S[SI.lp923] = f923.lpY; }
    if (f923.hpOn) { const x = ev(DI.hp923In); f923.hpY += (x - f923.hpY) * f923.cHp; S[SI.hp923] = x - f923.hpY; }

    // ── 960 sequential controller ──
    if (sq.on && sq.p) {
      const q = sq.p;
      const on = ev(DI.s960on), off = ev(DI.s960off), sh = ev(DI.s960sh);
      if (on > 2.5 && sq.prevOn <= 2.5) sq.run = true;
      if (off > 2.5 && sq.prevOff <= 2.5) sq.run = false;
      sq.prevOn = on; sq.prevOff = off;
      let jumped = false;
      for (let k = 0; k < 8; k++) {
        const x = ev(S960_I[k]);
        if (x > 2.5 && sq.prevIn[k] <= 2.5) { sq.st = k; jumped = true; }
        sq.prevIn[k] = x;
      }
      if (sh > 2.5 && sq.prevSh <= 2.5 && !jumped) advance960();
      sq.prevSh = sh;
      const rowV = (r) => (q.rows[r][sq.st] / 10) * q.range[r];
      // the clock: FREQUENCY RANGE and VERNIER, its control input at 1 V/oct, and row C when it controls the timing
      const cv = ev(DI.s960cv) + (q.timing ? rowV(2) : 0);
      const hz = Math.min(q.hz * Math.exp(cv * Math.LN2), sr * 0.2);
      if (sq.run) {
        sq.ph += hz / sr;
        if (sq.ph >= 1) { sq.ph -= Math.floor(sq.ph); advance960(); }
      }
      // clock pulses: high for 90 % of each cycle while running
      S[SI.s960clk] = sq.run && sq.ph < 0.9 ? 5 : 0;
      S[SI.s960a] = rowV(0); S[SI.s960b] = rowV(1); S[SI.s960c] = rowV(2);
      for (let k = 0; k < 8; k++) S[S960_O[k]] = k === sq.st ? 5 : 0;
    }
    // ── 962 sequential switch ──
    if (sw.on) {
      for (let k = 0; k < 3; k++) {
        const x = ev(SW_S[k]);
        if (x > 2.5 && sw.prevS[k] <= 2.5) sw.st = k;
        sw.prevS[k] = x;
      }
      const sh = ev(DI.sw962sh);
      if (sh > 2.5 && sw.prevSh <= 2.5) {
        // steps through the inputs that are patched (two or three)
        const n = cabled[DI.sw962i3] ? 3 : 2;
        sw.st = (sw.st + 1) % n;
      }
      sw.prevSh = sh;
      S[SI.sw962] = ev(SW_I[sw.st]);
      for (let k = 0; k < 3; k++) S[SW_T[k]] = k === sw.st ? 5 : 0;
    }
    // ── 911A dual trigger delay: an S-trigger that stays on longer than the delay is passed on, late ──
    if (dt.on) {
      const inU = sOn(DI.dtI1);
      const inL = dt.mode === 'parallel' ? inU : dt.mode === 'series' ? dt.outOn[0] : sOn(DI.dtI2);
      [inU, inL].forEach((x, k) => {
        if (x) { dt.t[k] += 1 / sr; dt.outOn[k] = dt.t[k] >= dt.d[k]; } else { dt.t[k] = 0; dt.outOn[k] = false; }
      });
      S[SI.dtO1] = dt.outOn[0] ? 0 : TRIG_HI;
      S[SI.dtO2] = dt.outOn[1] ? 0 : TRIG_HI;
    }
    // ── 995 attenuators ──
    if (q995On) for (let k = 0; k < 6; k++) { q995[k] += (q995T[k] - q995[k]) * sm; S[Q_O[k]] = ev(Q_D[k]) * q995[k]; }

    // ── 961 interface ──
    if (i961.on) {
      // audio → V-trigger: the input's level, scaled by SENSITIVITY, against a fixed threshold
      const ax = Math.abs(ev(DI.i9au)) * i961.sens;
      i961.follow += (ax - i961.follow) * (ax > i961.follow ? 0.05 : 0.0008);
      if (i961.follow > 1.5) i961.aHold = Math.round(0.005 * sr);
      S[SI.i9a] = i961.aHold > 0 ? TRIG_HI : 0;
      if (i961.aHold > 0) i961.aHold--;
      // S-trigger → V-trigger
      S[SI.i9vL] = sOn(DI.i9siL) ? TRIG_HI : 0;
      S[SI.i9vR] = sOn(DI.i9siR) ? TRIG_HI : 0;
      // V-trigger → S-trigger: the A inputs pass straight through; a rise at a B input holds it on for SWITCH-ON TIME
      const bl = ev(DI.i9bL), br = ev(DI.i9bR);
      if (bl > 2.5 && i961.bLPrev <= 2.5) i961.bL = Math.round(i961.onL * sr);
      if (br > 2.5 && i961.bRPrev <= 2.5) i961.bR = Math.round(i961.onR * sr);
      i961.bLPrev = bl; i961.bRPrev = br;
      S[SI.i9sL] = ev(DI.i9aL) > 2.5 || i961.bL > 0 ? 0 : TRIG_HI;
      S[SI.i9sR] = ev(DI.i9aR) > 2.5 || i961.bR > 0 ? 0 : TRIG_HI;
      if (i961.bL > 0) i961.bL--;
      if (i961.bR > 0) i961.bR--;
    }
  }

  /** Whether envelope slot i (0-based) is past its attack: for the panel lamps and the meter. */
  const envLevel = (i) => (env[i] ? env[i].level : 0);
  /** The 960's current stage (0-based) and whether it is running, for the panel lamps. */
  const seqState = () => (sq.p ? { stage: sq.st, run: sq.run } : null);
  return { set, step, envLevel, seqState };
}
