// The databank's joins: who played what, on which instrument, made by whom. Plain data in, plain data out, so the
// UI and check.mjs share one reading of it. Shape: see CONTRACT.md → Databank.
import SONGS from '@/bank/songs.js';
import ARTISTS from '@/bank/artists.js';
import MAKERS from '@/bank/makers.js';
import INSTRUMENTS from '@/bank/instruments.js';

export { SONGS, ARTISTS, MAKERS, INSTRUMENTS };

const index = (rows) => new Map(rows.map((r) => [r.id, r]));
const artistMap = index(ARTISTS);
const makerMap = index(MAKERS);
const instrumentMap = index(INSTRUMENTS);
const songMap = index(SONGS);

export const artistById = (id) => artistMap.get(id);
export const makerById = (id) => makerMap.get(id);
export const instrumentById = (id) => instrumentMap.get(id);
export const songById = (id) => songMap.get(id);

/** The first year in a year field ('1982', '1970s–80s', '2001–06'), for sorting; undated works go last. */
export const yearOf = (y) => { const m = String(y || '').match(/\d{4}/); return m ? Number(m[0]) : 9999; };
export const byYear = (a, b) => yearOf(a.year) - yearOf(b.year) || a.title.localeCompare(b.title);

/** The decade a year field falls in, as '1980s'. */
export const decadeOf = (y) => { const n = yearOf(y); return n === 9999 ? null : `${Math.floor(n / 10) * 10}s`; };

/** How a work's artists are printed: its own credit if it has one, otherwise the names joined. */
export const creditOf = (song) => song.credit || song.artists.map((id) => artistMap.get(id)?.name || id).join(' and ');

/** Instruments an app synth models (`app` in instruments.js). */
export const instrumentsForSynth = (synthId) => INSTRUMENTS.filter((i) => i.app?.includes(synthId));

/**
 * One synth's "Heard on" list, in the shape the lineage dialog shows: every work with a part played on an instrument
 * this synth models, or listed under it by hand (`synths`). The part's per-synth note and sound win over the general ones.
 */
export function heardFor(synthId) {
  const covers = new Set(instrumentsForSynth(synthId).map((i) => i.id));
  const out = [];
  for (const s of SONGS) {
    const p = s.parts.find((x) => x.synths?.includes(synthId)) || s.parts.find((x) => x.instruments.some((i) => covers.has(i)));
    if (!p) continue;
    out.push({ who: creditOf(s), what: s.title, year: s.year, on: p.on, text: p.notes?.[synthId] || p.text, sound: p.sounds?.[synthId], song: s.id, artists: s.artists });
  }
  return out.sort((a, b) => yearOf(a.year) - yearOf(b.year) || a.what.localeCompare(b.what));
}

/** Works an artist appears on: as a credited artist, or as the player of a part. */
export const songsBy = (artistId) => SONGS.filter((s) => s.artists.includes(artistId) || s.parts.some((p) => p.player === artistId)).sort(byYear);

/** Works with a part played on an instrument. */
export const songsOn = (instrumentId) => SONGS.filter((s) => s.parts.some((p) => p.instruments.includes(instrumentId))).sort(byYear);

/** Every instrument an artist is linked to: from their records, then the ones listed on the artist. */
export function instrumentsOf(artistId) {
  const ids = new Set();
  for (const s of songsBy(artistId)) for (const p of s.parts) for (const i of p.instruments) ids.add(i);
  for (const i of artistMap.get(artistId)?.instruments || []) ids.add(i);
  return [...ids].map((id) => instrumentMap.get(id)).filter(Boolean);
}

/** Artists linked to an instrument, by record or by their own list. */
export const artistsOn = (instrumentId) => ARTISTS.filter((a) => instrumentsOf(a.id).some((i) => i.id === instrumentId));

/** Instruments a maker had a hand in. */
export const instrumentsBy = (makerId) => INSTRUMENTS.filter((i) => i.people?.includes(makerId)).sort((a, b) => yearOf(a.year) - yearOf(b.year));

/** Decades an artist is filed under: their own `eras`, or else the decades of their records. */
export const erasOf = (artist) => (artist.eras?.length ? artist.eras : [...new Set(songsBy(artist.id).map((s) => decadeOf(s.year)).filter(Boolean))]);

/**
 * Every broken reference in the databank, as plain sentences (empty when it is sound). `presetsFor(synthId)` returns
 * that synth's preset ids, or null for an unknown synth.
 */
export function checkBank(presetsFor) {
  const errs = [];
  const seen = new Map();
  for (const [kind, rows] of [['artist', ARTISTS], ['maker', MAKERS], ['instrument', INSTRUMENTS], ['song', SONGS]]) {
    for (const r of rows) {
      if (!r.id || !/^[a-z0-9-]+$/.test(r.id)) errs.push(`${kind} has a bad id: ${r.id}`);
      const key = kind === 'artist' || kind === 'maker' ? 'person' : kind;
      if (seen.has(`${key}:${r.id}`)) errs.push(`duplicate ${kind} id ${r.id}`);
      seen.set(`${key}:${r.id}`, true);
    }
  }
  const synthOk = (id) => presetsFor(id) != null;
  for (const i of INSTRUMENTS) {
    for (const p of i.people || []) if (!makerMap.has(p)) errs.push(`instrument ${i.id}: unknown maker ${p}`);
    for (const a of i.app || []) if (!synthOk(a)) errs.push(`instrument ${i.id}: unknown app synth ${a}`);
  }
  for (const a of ARTISTS) {
    for (const k of ['members', 'memberOf']) for (const m of a[k] || []) if (!artistMap.has(m)) errs.push(`artist ${a.id}: unknown ${k} ${m}`);
    for (const i of a.instruments || []) if (!instrumentMap.has(i)) errs.push(`artist ${a.id}: unknown instrument ${i}`);
    for (const k of ['name', 'summary', 'story']) if (!a[k]) errs.push(`artist ${a.id} has no ${k}`);
  }
  for (const m of MAKERS) for (const k of ['name', 'summary', 'story']) if (!m[k]) errs.push(`maker ${m.id} has no ${k}`);
  for (const s of SONGS) {
    if (!s.artists?.length) errs.push(`song ${s.id} has no artists`);
    for (const a of s.artists || []) if (!artistMap.has(a)) errs.push(`song ${s.id}: unknown artist ${a}`);
    if (!s.parts?.length) errs.push(`song ${s.id} has no parts`);
    for (const p of s.parts || []) {
      if (!p.instruments?.length) errs.push(`song ${s.id}: a part names no instrument`);
      for (const i of p.instruments || []) if (!instrumentMap.has(i)) errs.push(`song ${s.id}: unknown instrument ${i}`);
      if (p.player && !artistMap.has(p.player)) errs.push(`song ${s.id}: unknown player ${p.player}`);
      for (const x of p.synths || []) if (!synthOk(x)) errs.push(`song ${s.id}: unknown synth ${x}`);
      for (const [x, id] of Object.entries(p.sounds || {})) {
        const ids = presetsFor(x);
        if (!ids) errs.push(`song ${s.id}: sound for unknown synth ${x}`);
        else if (!ids.includes(id)) errs.push(`song ${s.id}: ${x} has no sound ${id}`);
      }
    }
  }
  return errs;
}
