// The patch-cable explainer for the Moog 900-series modulars (EngineParams `moog`, src/audio/moog-core.js).
// Same job and same result shape as explain.js, but every module here is separate and every signal is a voltage, so
// the text talks in volts: 1 V per octave on pitch and cutoff, 6 V to open a 902 fully, S-triggers and V-triggers.
// Nothing in it is written per system: it reads the jack defs, the SynthDef's `signalNames`, and the live `moog` params.
import { jackGain, jackMap } from '@/lib/patch.js';
import { fmtHz, fmtTime } from '@/lib/maps.js';

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const r1 = (n) => String(Math.round(n * 10) / 10).replace(/\.0$/, '');
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const times = (hz) => (hz >= 0.95 ? `${hz < 10 ? r1(hz) : Math.round(hz)} times a second` : `once every ${r1(1 / hz)} seconds`);
const jackName = (j) => j.name || j.label;

/** What a destination is, by its name. */
function destKind(d) {
  if (d === 'dryIn') return 'out';
  if (/^v\d(lf|dc|ac)$/.test(d) || /^d\dfi$/.test(d)) return 'pitch';
  if (/^v\d(lw|wc)$/.test(d) || /^d\dwi$/.test(d)) return 'width';
  if (d === 'lp904Cv' || d === 'hp904Cv') return 'cutoff';
  if (/^a\dcv$/.test(d)) return 'gain';
  if (/^e\dst$/.test(d) || d === 'i9siL' || d === 'i9siR' || /^v\dts$/.test(d)) return 'strig';
  if (/^v\dtv$/.test(d) || /^i9[ab][LR]$/.test(d) || /^s960(on|off|sh|i\d)$/.test(d) || /^sw962(sh|s\d)$/.test(d)) return 'vtrig';
  if (/^dtI\d$/.test(d)) return 'strig';
  if (d === 's960cv') return 'clock';
  if (/^sw962i\d$/.test(d) || /^q\dIn$/.test(d)) return 'util';
  if (/^v\dsy$/.test(d)) return 'sync';
  if (/^x\di\d$/.test(d) || /^mu\d+In$/.test(d) || /^t\dIn$/.test(d) || /^c\d(i\d|x)$/.test(d)) return 'util';
  return 'audio';
}
const KIND_LABEL = { clock: 'Clock speed', out: 'To the output', pitch: 'Pitch control', width: 'Pulse-width control', cutoff: 'Filter control', gain: 'Amplifier control',
  strig: 'S-trigger', vtrig: 'V-trigger', sync: 'Oscillator sync', util: 'Utility', audio: 'Audio input' };

/**
 * Follow a signal back through the passive and utility modules (multiples, attenuators, mixers, 902 amplifiers, the
 * 921B link thru jacks, 921A drivers) to the real sources: [{ root, sign, gain, via: [signal…], plus? }].
 */
function resolve(ctx, signal, seen = []) {
  if (seen.includes(signal)) return [{ root: 'none', sign: 1, gain: 1, via: [signal], loop: true }];
  const m = ctx.ep.moog;
  const into = (dest, gain = 1, sign = 1) => feeds(ctx, dest).flatMap((s) => resolve(ctx, s, [...seen, signal])
    .map((l) => ({ ...l, sign: l.sign * sign, gain: l.gain * gain, via: [signal, ...l.via] })));
  let mm;
  if ((mm = /^mu(\d+)$/.exec(signal))) return orNone(into(`mu${mm[1]}In`), signal);
  if ((mm = /^t(\d)$/.exec(signal))) {
    // half-normalled: the nearest patched input at or above this one feeds it
    let k = Number(mm[1]);
    while (k > 1 && !feeds(ctx, `t${k}In`).length) k--;
    return orNone(into(`t${k}In`, m.att[Number(mm[1]) - 1]), signal);
  }
  if ((mm = /^x(\d)([pn])$/.exec(signal))) {
    const q = m.mix[Number(mm[1]) - 1];
    const sign = mm[2] === 'n' ? -1 : 1;
    return orNone([1, 2, 3, 4].flatMap((k) => into(`x${mm[1]}i${k}`, q ? q.g[k - 1] * q.m : 0, sign)), signal);
  }
  if ((mm = /^a(\d)([pn])$/.exec(signal))) {
    const sign = mm[2] === 'n' ? -1 : 1;
    const ls = [...into(`a${mm[1]}ip`, 1, sign), ...into(`a${mm[1]}in`, 1, -sign)];
    return orNone(ls.map((l) => ({ ...l, vca: Number(mm[1]) })), signal);
  }
  if ((mm = /^q(\d)$/.exec(signal))) return orNone(into(`q${mm[1]}In`, (m.q995 || [])[Number(mm[1]) - 1] || 0), signal);
  if (signal === 'sw962') return orNone([1, 2, 3].flatMap((k) => into(`sw962i${k}`)), signal);
  if ((mm = /^c(\d)$/.exec(signal))) {
    const q = (m.ctl || [])[Number(mm[1]) - 1];
    if (!q) return orNone([], signal);
    return orNone([...[1, 2, 3].flatMap((k) => (q.on[k - 1] ? into(`c${mm[1]}i${k}`) : [])), ...into(`c${mm[1]}x`, q.x)], signal);
  }
  if ((mm = /^v(\d)(lft|lwt)$/.exec(signal))) return orNone(into(`v${mm[1]}${mm[2] === 'lft' ? 'lf' : 'lw'}`), signal);
  if ((mm = /^d(\d)([fw])$/.exec(signal))) {
    const ls = into(`d${mm[1]}${mm[2]}i`);
    const q = m.drv[Number(mm[1]) - 1];
    const knobV = q ? (mm[2] === 'f' ? q.v : q.w) : 0;
    // the knob's own voltage is a source too, unless it is at zero
    return Math.abs(knobV) > 0.005 || !ls.length ? [{ root: signal, sign: 1, gain: 1, via: [signal], knob: true }, ...ls] : ls;
  }
  return [{ root: signal, sign: 1, gain: 1, via: [signal] }];
}
const orNone = (ls, signal) => (ls.length ? ls : [{ root: 'none', sign: 1, gain: 1, via: [signal], empty: signal }]);
function feeds(ctx, dest) {
  return ctx.cables.filter((c) => ctx.jm[c.from] && ctx.jm[c.to] && ctx.jm[c.to].dest === dest && ctx.jm[c.from].signal).map((c) => ctx.jm[c.from].signal);
}

/** The pitch voltage reaching an oscillator's pitch inputs: whether it follows the keyboard, and its steady part in volts. */
function pitchOf(ctx, n) {
  const m = ctx.ep.moog;
  let volts = 0, kbd = false, moving = [];
  for (const d of [`v${n}lf`, `v${n}dc`]) {
    for (const s of feeds(ctx, d)) {
      for (const l of resolve(ctx, s)) {
        if (l.root === 'kcv1' || l.root === 'kcv2') kbd = true;
        else if (/^d\d[f]$/.test(l.root)) volts += m.drv[Number(l.root[1]) - 1].v * l.sign * l.gain;
        else if (l.root === 'p6') volts += 6 * l.gain;
        else if (l.root === 'n6') volts -= 6 * l.gain;
        else if (l.root !== 'none') moving.push(l.root);
      }
    }
  }
  return { volts, kbd, moving };
}
/** An oscillator's frequency at middle C (or its fixed frequency when it does not follow the keyboard). */
function vcoHz(ctx, n) {
  const q = ctx.ep.moog.vco[n - 1];
  if (!q) return 0;
  return 261.6256 * Math.pow(2, (pitchOf(ctx, n).volts * 12 + q.semi) / 12);
}

/** What kind of thing a source is: audio | lfo | env | kbd | vtrig | strig | const | noise | none. */
function kindOf(ctx, l) {
  const r = l.root;
  if (r === 'none') return 'none';
  if (r === 'white' || r === 'pink') return 'noise';
  if (r === 'kcv1' || r === 'kcv2') return 'kbd';
  if (r === 'p6' || r === 'n6' || /^d\d[fw]$/.test(r)) return 'const';
  if (/^e\d$/.test(r)) return 'env';
  if (r === 'ktrU' || r === 'ktrL') return trigOf(ctx, r);
  if (r === 'i9a' || r === 'i9vL' || r === 'i9vR') return 'vtrig';
  if (r === 'i9sL' || r === 'i9sR' || /^dtO\d$/.test(r)) return 'strig';
  if (r === 's960clk' || /^s960o\d$/.test(r) || /^sw962t\d$/.test(r)) return 'vtrig';
  if (/^s960[abc]$/.test(r)) return 'seq';
  const v = /^v(\d)(sin|tri|saw|rect|aux)$/.exec(r);
  if (v) {
    const n = Number(v[1]);
    const p = pitchOf(ctx, n);
    return !p.kbd && vcoHz(ctx, n) < 20 ? 'lfo' : 'audio';
  }
  return 'audio';
}
const trigOf = (ctx, r) => {
  const t = ctx.ep.moog.cm1a.trig;
  return t === 'v' ? 'vtrig' : t === 's' ? 'strig' : r === 'ktrU' ? 'strig' : 'vtrig';
};
const name = (ctx, s) => (ctx.def.signalNames && ctx.def.signalNames[s]) || s;
const WAVE = { sin: 'sine', tri: 'triangle', saw: 'sawtooth', rect: 'rectangular', aux: 'AUX' };

/** "921B Oscillator 1 (sawtooth, following the keyboard)" – the source with the facts that matter now. */
function live(ctx, l) {
  const m = ctx.ep.moog;
  const r = l.root;
  const k = kindOf(ctx, l);
  if (k === 'none') return 'nothing';
  if (k === 'kbd') return `${name(ctx, r)}: the keyboard pitch as a voltage, 0 V at middle C and 1 V more for each octave up`;
  if (k === 'vtrig') return `${name(ctx, r)}, a V-trigger (+5 V while it is on, 0 V otherwise)`;
  if (k === 'strig') return `${name(ctx, r)}, an S-trigger (held at 0 V while it is on, high otherwise)`;
  if (k === 'seq') return `${name(ctx, r)}: a stepped voltage, one knob’s worth for each stage the 960 plays, 0 to ${ctx.ep.moog.s960.range['abc'.indexOf(r[4])]} V`;
  if (r === 'p6' || r === 'n6') return `a steady ${r === 'p6' ? '+6' : '−6'} V`;
  if (/^d\df$/.test(r)) return `${name(ctx, r)}, ${r1(m.drv[Number(r[1]) - 1].v)} V from its FREQUENCY knob`;
  if (/^d\dw$/.test(r)) return `${name(ctx, r)}, ${r1(m.drv[Number(r[1]) - 1].w)} V from its WIDTH knob`;
  if (k === 'noise') return `${name(ctx, r)}, random at audio rate`;
  if (k === 'env') {
    const e = m.env[Number(r[1]) - 1];
    const fed = feeds(ctx, `e${r[1]}st`).length > 0;
    return `${name(ctx, r)} (rises to +6 V over ${fmtTime(e.t1)}, falls to ${r1(e.sus)} V over ${fmtTime(e.t2)}, then to 0 over ${fmtTime(e.t3)} after the trigger ends${fed ? '' : '; nothing is patched to its S-TRIG IN, so it never starts'})`;
  }
  const v = /^v(\d)(sin|tri|saw|rect|aux)$/.exec(r);
  if (v) {
    const n = Number(v[1]);
    const p = pitchOf(ctx, n);
    const hz = vcoHz(ctx, n);
    const how = p.kbd ? `following the keyboard, ${fmtHz(hz)} at middle C` : `at a fixed ${fmtHz(hz)}`;
    return `${name(ctx, r)} (${k === 'lfo' ? `${how}: slow enough to work as an LFO` : how})`;
  }
  return `${name(ctx, r)}, an audio signal`;
}

function carriesNow(ctx, a, leaves) {
  const real = leaves.filter((l) => l.root !== 'none');
  if (!real.length) {
    const l = leaves[0];
    return l.loop ? 'Right now: nothing useful, because its input is fed from its own output.' : `Right now: nothing. ${cap(name(ctx, l.empty || a.signal))} has nothing patched into it.`;
  }
  return `Right now: ${real.map((l) => {
    const bits = [];
    if (l.sign < 0) bits.push('turned upside down');
    if (l.vca) bits.push(`through 902 amplifier ${l.vca}, so only as loud as its control voltage lets it be`);
    if (Math.abs(l.gain - 1) > 0.02) bits.push(`at ${Math.round(l.gain * 100)}% strength`);
    return `${live(ctx, l)}${bits.length ? `, ${bits.join(', ')}` : ''}`;
  }).join(' plus ')}.`;
}

const DOES = {
  out: 'This is the app’s output, not a socket on the hardware: whatever arrives here is what you hear. On the real system you would patch this cable to your mixer or audio interface.',
  pitch: 'A pitch input at 1 V per octave: each volt arriving here raises the frequency by one octave. It adds to the other pitch inputs and the panel knobs.',
  width: 'A pulse-width input: the voltage here sets how wide the rectangular wave is. It only changes the RECTANGULAR output.',
  cutoff: 'A cutoff input at 1 V per octave: each volt moves the filter’s cutoff up one octave. It adds to FIXED CONTROL VOLTAGE and the other control inputs.',
  gain: 'A gain input: it adds to the 902’s FIXED CONTROL VOLTAGE. At 0 V or below the amplifier is shut; at +6 V it passes the signal at full level.',
  strig: 'An S-trigger input. Moog modules are triggered by pulling this line down to 0 V and holding it there; with nothing plugged in it stays high and nothing happens.',
  vtrig: 'A V-trigger input. It is on while the voltage here is above about +2.5 V.',
  sync: 'A sync input: each sharp fall in the signal (the reset of a sawtooth) restarts this oscillator’s cycle, if its SYNC switch is not OFF.',
  util: 'A utility input. The module passes the signal on, changed by its knobs, to its own outputs.',
  audio: 'A signal input. Audio or control voltages are both fine: the module processes whatever arrives.',
};

function hearOne(ctx, a, b, l) {
  const m = ctx.ep.moog;
  const dk = destKind(b.dest);
  const k = kindOf(ctx, l);
  const src = name(ctx, l.root);
  const g = l.gain;
  if (k === 'none') return 'Nothing yet: no signal is on this cable.';
  if (dk === 'out') {
    if (k === 'lfo' || k === 'env' || k === 'kbd' || k === 'const' || k === 'vtrig' || k === 'strig') return `${cap(src)} is a control voltage, not a sound. Fed to the output you hear at most a click when it jumps.`;
    return l.vca ? `You hear ${src} through 902 amplifier ${l.vca}: it sounds only while that amplifier’s control voltage is up.` : `You hear ${src}${feedsVcaFree(l) ? ' all the time, at a steady level: no amplifier is shaping it, so it drones whether or not a key is held. Put a 902 under an envelope in the path to make notes.' : '.'}`;
  }
  if (dk === 'strig') {
    if (k === 'strig') return b.dest.startsWith('e') ? `${cap(src)} now fires this envelope: it starts (T1) when the trigger goes on and runs its final decay (T3) when it ends.` : `${cap(src)} now drives this input the right way round.`;
    if (k === 'vtrig') return `Upside down. ${cap(src)} is a V-trigger, but this is an S-trigger input, which reads 0 V as “on”. So it is on while nothing is happening (no key held) and goes off when a key is pressed: the envelope sits open and dies away as you play. Set the CM1A’s TRIG MODE to S-TRIG, or convert through the 961 Interface.`;
    if (k === 'audio' || k === 'lfo') return `${cap(src)} is not a trigger, but every time it swings below about +2.5 V the input reads it as “on”. ${k === 'lfo' ? `Each cycle fires the envelope, ${times(lfoHz(ctx, l))}.` : 'At audio rate that is a buzz of retriggers, not a rhythm.'}`;
    return `${cap(src)} is read as on whenever it is below about +2.5 V.`;
  }
  if (dk === 'vtrig') {
    if (k === 'vtrig') return `${cap(src)} now fires this input each time it goes on.`;
    if (k === 'strig') return `Upside down. ${cap(src)} is an S-trigger (low while on), but this input expects a V-trigger (high while on), so it fires when the trigger ends, not when it starts. Use the other kind of trigger, or the 961 Interface to convert.`;
    if (k === 'lfo') return `It fires each time ${src} rises past +2.5 V, ${times(lfoHz(ctx, l))}.`;
    return `It fires whenever ${src} rises past about +2.5 V.`;
  }
  if (dk === 'pitch') {
    const isDrv = /^d\dfi$/.test(b.dest);
    const target = isDrv ? `every 921B linked to this 921A` : name(ctx, `v${b.dest[1]}saw`).replace(/ sawtooth$/, '');
    if (k === 'kbd') return `${cap(target)} now ${isDrv ? 'follow' : 'follows'} the keyboard: one octave up for each octave you play, so it plays in tune.${g < 0.98 ? ` It arrives at ${Math.round(g * 100)}% strength, so the scale is squeezed: notes land closer together than semitones.` : ''}`;
    if (k === 'lfo') {
      const a = ampOf(ctx, l);
      const semis = a == null ? null : a * Math.abs(g) * 12;
      const lead = `Vibrato: the pitch of ${target} rises and falls ${times(lfoHz(ctx, l))}`;
      if (semis == null) return `${lead}.`;
      const by = `${l.vca ? 'up to ' : ''}${cents(semis)} either way`;
      return semis > 3
        ? `${lead}, by ${by}. That is far wider than a musical vibrato, because every volt is an octave: turn it down through a CP35 attenuator, a 902 or the 921’s AUX OUT LEVEL.`
        : `${lead}, by ${by}${l.vca ? `, as far as 902 amplifier ${l.vca} is open` : ''}.`;
    }
    if (k === 'env') return `The pitch of ${target} follows the envelope: up by as much as ${r1(6 * g)} octaves at its peak, back down as it falls. Turned well down that is a quick blip at the start of each note.`;
    if (k === 'audio' || k === 'noise') return `Frequency modulation: ${src} shakes the pitch of ${target} at audio rate. You do not hear a wobble; you hear clangy, metallic overtones${b.dest.endsWith('ac') ? '. AC MOD blocks steady voltages, so only the movement gets through' : ''}.`;
    if (k === 'const') return `A steady voltage: it simply transposes ${target}, one octave per volt.`;
    if (k === 'seq') return `The sequence: ${target} ${isDrv ? 'play' : 'plays'} one note per stage of the 960, an octave for every volt. With the row’s RANGE on X1 the knobs span two octaves, about 0.42 of a knob division per semitone.`;
    return `${cap(src)} moves the pitch of ${target}, one octave per volt.`;
  }
  if (dk === 'width') {
    if (k === 'lfo') return `Pulse-width modulation: the rectangular wave gets thinner and wider ${times(lfoHz(ctx, l))}. You hear it as a slow, chorus-like movement. If the width goes past about 0 % or 96 % the wave stops for that part of the cycle.`;
    if (k === 'env') return 'The pulse width follows the envelope, so the tone of the rectangular wave changes through each note.';
    if (k === 'const') return 'A steady voltage: it sets the width of the rectangular wave, about 16 % per volt.';
    return `${cap(src)} moves the width of the rectangular wave.`;
  }
  if (dk === 'cutoff') {
    const flt = b.dest === 'lp904Cv' ? 'the 904A low-pass filter' : 'the 904B high-pass filter';
    if (k === 'kbd') return `Key tracking: ${flt} follows the keyboard, an octave per octave, so high notes stay as bright as low ones.`;
    if (k === 'env') return `The envelope opens ${flt} by up to ${r1(6 * g)} octaves on each note, then lets it fall back. A short T2 gives a pluck; a slow T1 gives a brassy swell.`;
    if (k === 'seq') return `The 960 sets the cutoff of ${flt} step by step, so each stage has its own brightness.`;
    if (k === 'lfo') return `Filter wobble: the cutoff of ${flt} rises and falls ${times(lfoHz(ctx, l))}.`;
    if (k === 'audio' || k === 'noise') return `${cap(src)} shakes the cutoff of ${flt} at audio rate: a growl or rasp on top of the sound.`;
    return `${cap(src)} moves the cutoff of ${flt}, an octave per volt.`;
  }
  if (dk === 'gain') {
    const q = m.vca[Number(b.dest[1]) - 1];
    const fixed = q ? q.v : 0;
    if (k === 'env') return `The envelope opens the amplifier on every note and closes it after: this is what turns a constant tone into notes.${fixed > 0.2 ? ` FIXED CONTROL VOLTAGE is at ${r1(fixed)} V, so the amplifier is part open even between notes and you will hear a drone. Turn it to 0.` : ''}`;
    if (k === 'lfo') return `Tremolo: the level rises and falls ${times(lfoHz(ctx, l))}. During the negative half of each cycle the amplifier is shut.`;
    if (k === 'vtrig') return 'The amplifier jumps open while the trigger is on: an organ-like on/off, with a click at each end.';
    if (k === 'strig') return 'Upside down: an S-trigger is high when nothing is happening, so the amplifier is open between notes and shuts while a key is held.';
    if (k === 'audio' || k === 'noise') return `Amplitude modulation: ${src} opens and shuts the amplifier at audio rate, adding ring-modulator-like overtones.`;
    if (k === 'kbd') return 'Loudness follows the keyboard: higher notes are louder, and notes below middle C are quieter or silent.';
    return `${cap(src)} sets how far the amplifier is open.`;
  }
  if (dk === 'clock') return `${cap(src)} changes the 960’s clock speed at 1 V per octave: each volt doubles the tempo.`;
  if (dk === 'sync') {
    if (k === 'audio') return `Hard sync: this oscillator restarts with every cycle of ${src}, so it takes that pitch and its own frequency setting changes the tone instead. Sweep its pitch for the tearing sync sound.`;
    return `${cap(src)} restarts this oscillator each time it falls sharply.`;
  }
  if (dk === 'util') return utilText(ctx, b, src);
  // audio-type inputs: filters, the 902s, the 961's audio input
  const into = (ctx.def.destNames && ctx.def.destNames[b.dest]) || jackName(b);
  if (/^a\d(ip|in)$/.test(b.dest) && (k === 'lfo' || k === 'env' || k === 'kbd' || k === 'const')) {
    return `${cap(src)} is a control voltage, and ${into} passes it on scaled by its own control voltage. That is how a modular fades one control signal with another: an LFO through a 902 opened by a slow envelope gives a vibrato that fades in.${b.dest.endsWith('in') ? ' This input turns it upside down.' : ''}`;
  }
  if (k === 'lfo' || k === 'env' || k === 'kbd' || k === 'const') return `${cap(src)} is a slow control voltage. ${cap(into)} passes it on as a control voltage, which is fine if you mean to process a CV; as audio it would be silent.`;
  return `${cap(into)} now processes ${src}.`;
}
const feedsVcaFree = (l) => !l.vca;
/** Peak voltage of a source as it leaves its module (before attenuators), or null when it is not a steady-sized wave. */
function ampOf(ctx, l) {
  const v = /^v(\d)(sin|tri|saw|rect|aux)$/.exec(l.root);
  if (v) { const q = ctx.ep.moog.vco[Number(v[1]) - 1]; return v[2] === 'aux' ? 5 * (q ? q.auxLevel : 0) : 5; }
  if (l.root === 'white' || l.root === 'pink') return 2.5;
  return null;
}
const cents = (semis) => (semis < 1 ? `${Math.max(1, Math.round(semis * 100))} cents` : `${r1(semis)} semitone${r1(semis) === '1' ? '' : 's'}`);
const lfoHz = (ctx, l) => { const v = /^v(\d)/.exec(l.root); return v ? vcoHz(ctx, Number(v[1])) : 1; };
function utilText(ctx, b, src) {
  const d = b.dest;
  if (/^sw962i\d$/.test(d)) return `The 962 passes ${src} to its output while this input is the selected one.`;
  if (/^q\dIn$/.test(d)) return `The 995 attenuator passes ${src} at the level set by its knob.`;
  if (/^mu\d+In$/.test(d)) return `The multiple now copies ${src} to its other jacks, so one signal can go to several places.`;
  if (/^t\dIn$/.test(d)) return `The attenuator now passes ${src} at the level set by its knob${d === 't1In' ? ', and, until the inputs below it are used, to the attenuators below too' : ''}.`;
  const cm = /^c(\d)(i(\d)|x)$/.exec(d);
  if (cm) {
    const q = (ctx.ep.moog.ctl || [])[Number(cm[1]) - 1];
    const off = cm[3] && q && !q.on[Number(cm[3]) - 1];
    return `${cap(name(ctx, `c${cm[1]}`))} adds ${src} to the voltage it sends to its outputs${cm[2] === 'x' ? ', scaled by its attenuator knob' : ''}.${off ? ' Its switch for this input is off, so nothing gets through until you turn it on.' : ''}`;
  }
  return `The mixer now adds ${src} to its other inputs, at this channel’s level.`;
}

/** Explain a cable on a Moog 900-series system. Same result shape as explainCable() in explain.js. */
export function explainMoog(def, ep, from, to, values, cables) {
  const jm = jackMap(def);
  const a = jm[from], b = jm[to];
  const plugged = cables.some((c) => c.from === from && c.to === to);
  const all = plugged ? cables : [...cables, { from, to }];
  const ctx = { def, ep, jm, values, cables: all };
  const leaves = resolve(ctx, a.signal).map((l) => ({ ...l, gain: l.gain * jackGain(a, values) }));
  const real = leaves.filter((l) => l.root !== 'none');
  const dk = destKind(b.dest);
  const others = all.filter((c) => c.to === to && c.from !== from && jm[c.from]).map((c) => jackName(jm[c.from]));
  const does = [DOES[dk]];
  if (others.length) does.push(`${list(others)} ${others.length > 1 ? 'are' : 'is'} plugged in here too, and the signals add together.`);
  const hear = real.length > 1
    ? `Several signals arrive down this cable, added together. ${real.map((l) => `From ${name(ctx, l.root)}: ${hearOne(ctx, a, b, l)}`).join(' ')}`
    : hearOne(ctx, a, b, real[0] || leaves[0]);
  const warnings = [];
  [a, b].forEach((j) => { if (typeof j.check === 'function') { const w = j.check(values); if (w) warnings.push(w); } });
  if (real.length && real.every((l) => Math.abs(l.gain) < 0.002)) warnings.push('The signal reaches this cable at zero strength: a level knob in its path is turned fully down.');
  const vca = real.find((l) => l.vca);
  if (vca && dk === 'out') {
    const q = ep.moog.vca[vca.vca - 1];
    const cv = all.some((c) => jm[c.to] && jm[c.to].dest === `a${vca.vca}cv`);
    if (!cv && q.v < 0.1) warnings.push(`902 amplifier ${vca.vca} is shut: its FIXED CONTROL VOLTAGE is at 0 and nothing is patched to its CONTROL INPUTs. Patch an envelope in, or turn the knob up.`);
  }
  return {
    from, to, plugged, title: `${jackName(a)} → ${jackName(b)}`, fromLabel: jackName(a), toLabel: jackName(b), fromHelp: a.help, toHelp: b.help,
    kind: KIND_LABEL[dk], modelled: true, carries: carriesNow(ctx, a, leaves), does: does.join(' '), hear, warnings,
  };
}
