import { useEffect, useMemo, useRef, useState } from 'react';
import { SYNTHS } from '@/synths/index.js';
import {
  ARTISTS, INSTRUMENTS, MAKERS, SONGS, artistById, artistsOn, byYear, creditOf, decadeOf, erasOf, instrumentById, instrumentsBy,
  instrumentsOf, makerById, songById, songsBy, songsOn, yearOf,
} from '@/bank/index.js';

const TABS = [
  ['artists', 'Artists'],
  ['makers', 'Innovators'],
  ['songs', 'Records'],
  ['instruments', 'Instruments'],
];
const KIND = { song: 'Song', album: 'Album', score: 'Score', body: 'Body of work', performance: 'Performance' };
const synthOf = (id) => SYNTHS.find((s) => s.id === id);
const fold = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/** What each tab lists, its words for the search, and how a row is labelled. */
const ROWS = {
  artists: {
    rows: () => [...ARTISTS].sort((a, b) => a.name.localeCompare(b.name)),
    words: (a) => [a.name, a.summary, a.country, ...(a.genres || []), ...(a.roles || []), ...erasOf(a), ...songsBy(a.id).map((s) => s.title), ...instrumentsOf(a.id).map((i) => i.name)].join(' '),
    title: (a) => a.name,
    sub: (a) => [a.country, erasOf(a).join(', '), a.genres?.[0]].filter(Boolean).join(' · '),
    group: (a) => erasOf(a)[0] || 'Undated',
  },
  makers: {
    rows: () => [...MAKERS].sort((a, b) => (yearOf(a.born) - yearOf(b.born)) || a.name.localeCompare(b.name)),
    words: (m) => [m.name, m.summary, m.country, ...(m.companies || []), ...instrumentsBy(m.id).map((i) => i.name)].join(' '),
    title: (m) => m.name,
    sub: (m) => [m.companies?.join(', '), m.born && `${m.born}–${m.died || ''}`].filter(Boolean).join(' · '),
    group: () => null,
  },
  songs: {
    rows: () => [...SONGS].sort(byYear),
    words: (s) => [s.title, s.album, creditOf(s), s.year, ...s.parts.flatMap((p) => [p.on, p.text])].join(' '),
    title: (s) => s.title,
    sub: (s) => [creditOf(s), s.year].filter(Boolean).join(' · '),
    group: (s) => decadeOf(s.year) || 'Undated',
  },
  instruments: {
    rows: () => [...INSTRUMENTS].sort((a, b) => yearOf(a.year) - yearOf(b.year) || a.name.localeCompare(b.name)),
    words: (i) => [i.name, i.maker, i.kind, i.text, ...(i.people || []).map((p) => makerById(p)?.name)].join(' '),
    title: (i) => i.name,
    sub: (i) => [i.maker, i.year, i.app?.length ? 'in this app' : null].filter(Boolean).join(' · '),
    group: (i) => decadeOf(i.year) || 'Undated',
  },
};
const find = { artists: artistById, makers: makerById, songs: songById, instruments: instrumentById };

/**
 * The databank: synth artists, their records, the instruments those were made on, and the people who built them,
 * as one browsable section. `route` is `{ tab, id }`; every link inside moves the route, so Back walks the trail.
 */
export function Bank({ open, route, onRoute, onClose, onLoadSound, onOpenSynth }) {
  const ref = useRef(null);
  const detailRef = useRef(null);
  const [q, setQ] = useState('');
  const [era, setEra] = useState(null);
  const [trail, setTrail] = useState([]);
  const tab = route?.tab || 'artists';
  const item = route?.id ? find[tab](route.id) : null;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => { if (detailRef.current) detailRef.current.scrollTop = 0; }, [tab, route?.id]);

  const go = (next) => { setTrail((t) => [...t.slice(-30), route]); onRoute(next); };
  const back = () => { const prev = trail[trail.length - 1]; setTrail((t) => t.slice(0, -1)); onRoute(prev || { tab }); };

  const fq = fold(q.trim());
  const matches = useMemo(() => Object.fromEntries(TABS.map(([t]) => {
    const R = ROWS[t];
    return [t, R.rows().filter((r) => !fq || fold(R.words(r)).includes(fq))];
  })), [fq]);
  const eras = useMemo(() => [...new Set(ARTISTS.flatMap(erasOf))].sort(), []);
  const R = ROWS[tab];
  // Artists are filed under the first decade they worked in (or the one picked), A–Z inside it.
  const list = tab !== 'artists' ? matches[tab]
    : era ? matches.artists.filter((a) => erasOf(a).includes(era))
      : [...matches.artists].sort((a, b) => R.group(a).localeCompare(R.group(b)) || a.name.localeCompare(b.name));
  const groups = [];
  for (const r of list) {
    const g = tab === 'artists' && era ? era : R.group(r);
    if (!groups.length || groups[groups.length - 1][0] !== g) groups.push([g, []]);
    groups[groups.length - 1][1].push(r);
  }

  const L = { go, onLoadSound, onOpenSynth };

  return (
    <dialog ref={ref} aria-labelledby="bank-h" onClose={onClose}
      className="m-auto h-[calc(100vh-24px)] w-[min(1280px,calc(100vw-24px))] max-h-none max-w-none overflow-hidden rounded-2xl border border-line bg-surface p-0 text-text shadow-2xl backdrop:bg-black/60">
      <div className="flex h-full flex-col">
        <header className="border-b border-line px-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="kys-label text-accent">Databank</p>
              <h2 id="bank-h" className="mt-1 font-display text-[19px] leading-tight text-balance">Synth artists, their records, and the people who built the instruments</h2>
            </div>
            <button type="button" onClick={() => ref.current.close()} aria-label="Close" className="-mr-1 px-1 text-2xl leading-none text-muted hover:text-text">×</button>
          </div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div role="tablist" aria-label="Databank" className="-mb-px flex min-w-0 max-w-full gap-1 overflow-x-auto">
              {TABS.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} aria-controls="bank-panel" onClick={() => go({ tab: id })}
                  className={`flex shrink-0 items-baseline gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${tab === id ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'}`}>
                  {label}<span className="font-mono text-xs text-faint">{matches[id].length}</span>
                </button>
              ))}
            </div>
            <label className="mb-2 flex min-w-0 basis-[220px] flex-1 items-center gap-2 rounded-md border border-line bg-ground px-2.5 py-1.5 text-sm sm:max-w-[320px]">
              <span className="kys-label text-faint">Find</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="name, song, synth, genre…"
                className="min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-faint" />
            </label>
          </div>
        </header>

        <div id="bank-panel" role="tabpanel" className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)]">
          <nav aria-label={`${TABS.find(([t]) => t === tab)[1]} list`}
            className={`kys-scroll min-h-0 overflow-y-auto border-line px-2 py-3 lg:block lg:border-r ${item ? 'hidden' : ''}`}>
            {tab === 'artists' && (
              <div className="mb-2 flex flex-wrap gap-1 px-2" role="group" aria-label="Era">
                {[null, ...eras].map((e) => (
                  <button key={e || 'all'} type="button" aria-pressed={era === e} onClick={() => setEra(e)}
                    className={`rounded px-2 py-0.5 font-mono text-xs ${era === e ? 'bg-text text-ground' : 'text-muted hover:text-text'}`}>{e || 'All'}</button>
                ))}
              </div>
            )}
            {!list.length && <p className="px-2 text-sm text-faint">Nothing matches “{q}”.</p>}
            {groups.map(([g, rows]) => (
              <div key={g || 'all'} className="mb-2">
                {g && <p className="kys-label px-2 pb-1 pt-2 text-faint">{g}</p>}
                <ul>
                  {rows.map((r) => (
                    <li key={r.id}>
                      <button type="button" aria-current={route?.id === r.id} onClick={() => go({ tab, id: r.id })}
                        className={`block w-full rounded-lg px-2.5 py-1.5 text-left ${route?.id === r.id ? 'bg-accent/12' : 'hover:bg-ground'}`}>
                        <span className="block text-[14px] font-semibold leading-snug">{R.title(r)}</span>
                        <span className="block truncate text-[12.5px] text-muted">{R.sub(r)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div ref={detailRef} className={`kys-scroll min-h-0 overflow-y-auto px-4 py-5 sm:px-6 ${item ? '' : 'hidden lg:block'}`}>
            {item && (
              <button type="button" onClick={back} className="kys-label mb-3 text-accent hover:underline">‹ Back</button>
            )}
            {!item && <Welcome tab={tab} go={go} />}
            {item && tab === 'artists' && <Artist a={item} L={L} />}
            {item && tab === 'makers' && <Maker m={item} L={L} />}
            {item && tab === 'songs' && <Song s={item} L={L} />}
            {item && tab === 'instruments' && <Instrument i={item} L={L} />}
          </div>
        </div>
      </div>
    </dialog>
  );
}

function Welcome({ tab, go }) {
  const text = {
    artists: 'The players, bands, producers and composers who made records with synthesizers: when they worked, which instruments they used, and what they did that others had not. Pick a name, or narrow the list by era.',
    makers: 'The people who designed the instruments and founded the companies that made them, and the ideas each one brought in.',
    songs: 'Songs, albums and scores where the synthesizer used is well documented, oldest first. Each links to the artists, the instruments, and a sound in that style in this app.',
    instruments: 'The synthesizers named on those records, and the originals the panels in this app are modelled on.',
  }[tab];
  const picks = { artists: ['wendy-carlos', 'kraftwerk', 'jean-michel-jarre', 'phuture'], makers: ['robert-moog', 'don-buchla', 'dave-smith', 'ikutaro-kakehashi'], songs: [], instruments: ['moog-minimoog', 'roland-jupiter-8', 'ems-vcs3', 'roland-tb-303'] }[tab]
    .filter((id) => find[tab](id));
  return (
    <div className="max-w-[68ch]">
      <p className="text-[15px] leading-relaxed text-text/90">{text}</p>
      {picks.length > 0 && (
        <>
          <p className="kys-label mt-5 text-muted">Start with</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {picks.map((id) => <Chip key={id} onClick={() => go({ tab, id })}>{ROWS[tab].title(find[tab](id))}</Chip>)}
          </div>
        </>
      )}
    </div>
  );
}

const Chip = ({ children, onClick, tone }) => (
  <button type="button" onClick={onClick}
    className={`rounded-md border px-2.5 py-1 text-left text-sm ${tone === 'app' ? 'border-accent/60 text-accent hover:bg-accent hover:text-accent-ink' : 'border-line text-text hover:border-muted'}`}>{children}</button>
);

const Section = ({ title, children }) => (
  <section className="mt-6">
    <h4 className="kys-label mb-2 text-muted">{title}</h4>
    {children}
  </section>
);

function Head({ over, name, line }) {
  return (
    <>
      {over && <p className="kys-label text-accent">{over}</p>}
      <h3 className="mt-1 font-display text-[22px] leading-tight text-balance">{name}</h3>
      {line && <p className="mt-2 max-w-[70ch] text-[16px] leading-relaxed">{line}</p>}
    </>
  );
}

/** Buttons that open a synth's panel in this app, one per app synth modelling the instrument. */
function AppLinks({ i, L }) {
  return (i.app || []).map((sid) => synthOf(sid) && (
    <Chip key={sid} tone="app" onClick={() => L.onOpenSynth(sid)}>Open the {synthOf(sid).maker} {synthOf(sid).name} panel</Chip>
  ));
}

/** A work as a card: its credit, the instruments, what they play, and a sound in that style on each synth that has one. */
function SongCard({ s, L, hideArtist }) {
  return (
    <li className="flex flex-col rounded-xl border border-line bg-ground p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <button type="button" onClick={() => L.go({ tab: 'songs', id: s.id })} className="min-w-0 text-left font-semibold leading-snug hover:underline">{s.title}</button>
        <span className="shrink-0 font-mono text-xs text-faint">{s.year}</span>
      </div>
      {!hideArtist && (
        <p className="text-[14px] leading-snug text-text/90">
          {s.artists.map((id, k) => (
            <span key={id}>{k > 0 && ' · '}<button type="button" onClick={() => L.go({ tab: 'artists', id })} className="hover:underline">{artistById(id)?.name || id}</button></span>
          ))}
        </p>
      )}
      {s.parts.map((p, k) => <Part key={k} p={p} L={L} />)}
    </li>
  );
}

function Part({ p, L }) {
  return (
    <div className="mt-1.5">
      <p className="kys-label text-muted">Played on: <span className="text-text">{p.on}</span></p>
      <p className="mt-1 text-[14px] leading-relaxed text-muted">{p.text}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {p.instruments.map((id) => instrumentById(id) && (
          <button key={id} type="button" onClick={() => L.go({ tab: 'instruments', id })}
            className="rounded border border-line px-1.5 py-0.5 text-xs text-muted hover:border-muted hover:text-text">{instrumentById(id).name}</button>
        ))}
      </div>
      {Object.entries(p.sounds || {}).map(([sid, pid]) => {
        const syn = synthOf(sid);
        const pre = syn?.presets.find((x) => x.id === pid);
        return pre && (
          <button key={sid} type="button" onClick={() => L.onLoadSound(sid, pid)}
            className="mt-2 block rounded-md border border-line px-2.5 py-1 text-left text-sm text-muted hover:border-muted hover:text-text">
            Load a sound in this style on the {syn.name}: <span className="text-text">{pre.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function Artist({ a, L }) {
  const songs = songsBy(a.id);
  const insts = instrumentsOf(a.id);
  const over = [a.kind === 'group' ? 'Group' : (a.roles || []).join(', '), a.country, a.active].filter(Boolean).join(' · ');
  return (
    <article>
      <Head over={over} name={a.name} line={a.summary} />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {erasOf(a).map((e) => <span key={e} className="rounded bg-accent/12 px-1.5 py-0.5 font-mono text-xs text-accent">{e}</span>)}
        {(a.genres || []).map((g) => <span key={g} className="rounded border border-line px-1.5 py-0.5 text-xs text-muted">{g}</span>)}
      </div>
      <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-text/90">{a.story}</p>
      {a.innovations?.length > 0 && (
        <Section title="What they did differently">
          <ul className="flex max-w-[70ch] list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed">{a.innovations.map((t) => <li key={t}>{t}</li>)}</ul>
        </Section>
      )}
      {(a.members?.length > 0 || a.memberOf?.length > 0) && (
        <Section title={a.members?.length ? 'Members in the databank' : 'Member of'}>
          <div className="flex flex-wrap gap-2">
            {[...(a.members || []), ...(a.memberOf || [])].map((id) => artistById(id) && <Chip key={id} onClick={() => L.go({ tab: 'artists', id })}>{artistById(id).name}</Chip>)}
          </div>
        </Section>
      )}
      {songs.length > 0 && (
        <Section title={`Records (${songs.length})`}>
          <ul className="grid gap-2 xl:grid-cols-2">{songs.map((s) => <SongCard key={s.id} s={s} L={L} hideArtist={s.artists.length === 1} />)}</ul>
        </Section>
      )}
      {insts.length > 0 && (
        <Section title="Synths">
          <div className="flex flex-wrap gap-2">{insts.map((i) => <Chip key={i.id} onClick={() => L.go({ tab: 'instruments', id: i.id })}>{i.name}</Chip>)}</div>
        </Section>
      )}
    </article>
  );
}

function Maker({ m, L }) {
  const insts = instrumentsBy(m.id);
  const over = [m.born && `${m.born}–${m.died || ''}`, m.country, (m.companies || []).join(', ')].filter(Boolean).join(' · ');
  return (
    <article>
      <Head over={over} name={m.name} line={m.summary} />
      <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-text/90">{m.story}</p>
      {m.innovations?.length > 0 && (
        <Section title="What they introduced">
          <ul className="flex max-w-[70ch] list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed">{m.innovations.map((t) => <li key={t}>{t}</li>)}</ul>
        </Section>
      )}
      {insts.length > 0 && (
        <Section title="Instruments">
          <ul className="grid gap-2 xl:grid-cols-2">
            {insts.map((i) => (
              <li key={i.id} className="rounded-xl border border-line bg-ground p-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <button type="button" onClick={() => L.go({ tab: 'instruments', id: i.id })} className="text-left font-semibold leading-snug hover:underline">{i.name}</button>
                  <span className="shrink-0 font-mono text-xs text-faint">{i.year}</span>
                </div>
                <p className="mt-1 text-[14px] leading-relaxed text-muted">{i.text}</p>
                {i.app?.length > 0 && <div className="mt-2 flex flex-wrap gap-2"><AppLinks i={i} L={L} /></div>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  );
}

function Song({ s, L }) {
  return (
    <article>
      <Head over={[KIND[s.kind], s.year, s.album].filter(Boolean).join(' · ')} name={s.title} />
      <p className="mt-2 text-[16px]">
        {s.credit && <span className="text-muted">{s.credit} — </span>}
        {s.artists.map((id, k) => (
          <span key={id}>{k > 0 && ' · '}<button type="button" onClick={() => L.go({ tab: 'artists', id })} className="font-semibold text-accent hover:underline">{artistById(id)?.name || id}</button></span>
        ))}
      </p>
      <div className="mt-4 max-w-[70ch]">{s.parts.map((p, k) => <Part key={k} p={p} L={L} />)}</div>
    </article>
  );
}

function Instrument({ i, L }) {
  const songs = songsOn(i.id);
  const artists = artistsOn(i.id);
  return (
    <article>
      <Head over={[i.maker, i.year, i.kind].filter(Boolean).join(' · ')} name={i.name} line={i.text} />
      {i.app?.length > 0 && <div className="mt-3 flex flex-wrap gap-2"><AppLinks i={i} L={L} /></div>}
      {i.people?.length > 0 && (
        <Section title="The people behind it">
          <div className="flex flex-wrap gap-2">{i.people.map((id) => makerById(id) && <Chip key={id} onClick={() => L.go({ tab: 'makers', id })}>{makerById(id).name}</Chip>)}</div>
        </Section>
      )}
      {songs.length > 0 && (
        <Section title={`Heard on (${songs.length})`}>
          <ul className="grid gap-2 xl:grid-cols-2">{songs.map((s) => <SongCard key={s.id} s={s} L={L} />)}</ul>
        </Section>
      )}
      {artists.length > 0 && (
        <Section title="Artists who used one">
          <div className="flex flex-wrap gap-2">{artists.map((a) => <Chip key={a.id} onClick={() => L.go({ tab: 'artists', id: a.id })}>{a.name}</Chip>)}</div>
        </Section>
      )}
    </article>
  );
}
