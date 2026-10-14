/**
 * The databank's pages: one artist, innovator, record or instrument, and each tab's welcome.
 *
 * Transliterated from the prototype file `src/ui/Bank.jsx` (D3). Server components: every link is a URL, so the
 * dialog's callbacks become links. Moving inside the databank goes to another of its pages; "Open the … panel" goes
 * to the synth's page; "Load a sound in this style" goes to the synth's page with that sound loaded (`?sound=`).
 *
 * One addition the prototype did not have: an instrument says which original it recreates, and lists its recreations
 * (owner ruling at claim, `f-databank`: a recreation is an instrument of its own, linked to the original it models).
 */

import Link from 'next/link';
import type { Bank, BankPart, BankSong } from '@/lib/app/bank/data';
import type {
  ArtistDetail,
  BankKind,
  InstrumentDetail,
  InstrumentRef,
  MakerDetail,
  SongDetail,
} from '@/lib/app/bank/read';
import { bankHref } from '@/components/app/bank/routes';
import { soundHref, synthHref } from '@/components/app/synth/routes';

const KIND: Record<BankSong['kind'], string> = {
  song: 'Song',
  album: 'Album',
  score: 'Score',
  body: 'Body of work',
  performance: 'Performance',
};

/** The names a page prints for the ids it links to. */
export interface BankNames {
  artists: ReadonlyMap<string, string>;
  instruments: ReadonlyMap<string, string>;
  makers: ReadonlyMap<string, string>;
  /** Listed app synths: the ones a panel link can open. */
  synths: ReadonlyMap<string, { maker: string; name: string }>;
  /** App synth id → its library sounds' names, by sound id. */
  sounds: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export function namesFrom(
  bank: Bank,
  synths: { id: string; maker: string; name: string }[],
  sounds: Record<string, Record<string, string>>
): BankNames {
  return {
    artists: new Map(bank.artists.map((a) => [a.id, a.name])),
    instruments: new Map(bank.instruments.map((i) => [i.id, i.name])),
    makers: new Map(bank.makers.map((m) => [m.id, m.name])),
    synths: new Map(synths.map((s) => [s.id, { maker: s.maker, name: s.name }])),
    sounds,
  };
}

const WELCOME: Record<BankKind, string> = {
  artists:
    'The players, bands, producers and composers who made records with synthesizers: when they worked, which instruments they used, and what they did that others had not. Pick a name, or narrow the list by era.',
  makers:
    'The people who designed the instruments and founded the companies that made them, and the ideas each one brought in.',
  songs:
    'Songs, albums and scores where the synthesizer used is well documented, oldest first. Each links to the artists, the instruments, and a sound in that style in this app.',
  instruments:
    'The synthesizers named on those records, and the originals the panels in this app are modelled on.',
};

const PICKS: Record<BankKind, string[]> = {
  artists: ['wendy-carlos', 'kraftwerk', 'jean-michel-jarre', 'phuture'],
  makers: ['robert-moog', 'don-buchla', 'dave-smith', 'ikutaro-kakehashi'],
  songs: [],
  instruments: ['moog-minimoog', 'roland-jupiter-8', 'ems-vcs3', 'roland-tb-303'],
};

const pickNames = (tab: BankKind, names: BankNames): ReadonlyMap<string, string> =>
  tab === 'artists'
    ? names.artists
    : tab === 'makers'
      ? names.makers
      : tab === 'instruments'
        ? names.instruments
        : new Map();

/** A tab with no row open: what it holds, and where to start. */
export function Welcome({ tab, names }: { tab: BankKind; names: BankNames }) {
  const from = pickNames(tab, names);
  const picks = PICKS[tab].flatMap((id) => {
    const name = from.get(id);
    return name ? [{ id, name }] : [];
  });
  return (
    <div className="max-w-[68ch]">
      <p className="text-[15px] leading-relaxed text-(--kys-text)/90">{WELCOME[tab]}</p>
      {picks.length > 0 && (
        <>
          <p className="kys-label mt-5 text-(--kys-muted)">Start with</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {picks.map((p) => (
              <Chip key={p.id} href={bankHref(tab, p.id)}>
                {p.name}
              </Chip>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ children, href, tone }: { children: React.ReactNode; href: string; tone?: 'app' }) {
  return (
    <Link
      href={href}
      className={`rounded-md border px-2.5 py-1 text-left text-sm ${tone === 'app' ? 'border-(--kys-accent)/60 text-(--kys-accent) hover:bg-(--kys-accent) hover:text-(--kys-accent-ink)' : 'border-(--kys-line) text-(--kys-text) hover:border-(--kys-muted)'}`}
    >
      {children}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="kys-label mb-2 text-(--kys-muted)">{title}</h3>
      {children}
    </section>
  );
}

function Head({ over, name, line }: { over?: string; name: string; line?: string }) {
  return (
    <>
      {over && <p className="kys-label text-(--kys-accent)">{over}</p>}
      <h2 className="kys-display mt-1 text-[22px] leading-tight text-balance">{name}</h2>
      {line && <p className="mt-2 max-w-[70ch] text-[16px] leading-relaxed">{line}</p>}
    </>
  );
}

const line = (parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

/** Links that open a synth's panel in this app, one per listed app synth modelling the instrument. */
function AppLinks({ synths, names }: { synths: string[]; names: BankNames }) {
  return synths.flatMap((sid) => {
    const s = names.synths.get(sid);
    return s
      ? [
          <Chip key={sid} tone="app" href={synthHref(sid)}>
            Open the {s.maker} {s.name} panel
          </Chip>,
        ]
      : [];
  });
}

function InstrumentChips({ items }: { items: InstrumentRef[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <Chip key={i.id} href={bankHref('instruments', i.id)}>
          {i.name}
        </Chip>
      ))}
    </div>
  );
}

function PeopleChips({
  tab,
  people,
}: {
  tab: 'artists' | 'makers';
  people: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {people.map((p) => (
        <Chip key={p.id} href={bankHref(tab, p.id)}>
          {p.name}
        </Chip>
      ))}
    </div>
  );
}

function Innovations({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <Section title={title}>
      <ul className="flex max-w-[70ch] list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </Section>
  );
}

/** A work's artists, each a link to their page when the databank has one. */
function Credits({ ids, names, strong }: { ids: string[]; names: BankNames; strong?: boolean }) {
  return ids.map((id, k) => {
    const name = names.artists.get(id);
    return (
      <span key={id}>
        {k > 0 && ' · '}
        {name ? (
          <Link
            href={bankHref('artists', id)}
            className={
              strong ? 'font-semibold text-(--kys-accent) hover:underline' : 'hover:underline'
            }
          >
            {name}
          </Link>
        ) : (
          id
        )}
      </span>
    );
  });
}

/** A work as a card: its credit, the instruments, what they play, and a sound in that style on each synth that has one. */
function SongCard({
  s,
  names,
  hideArtist,
}: {
  s: BankSong;
  names: BankNames;
  hideArtist?: boolean;
}) {
  return (
    <li className="flex flex-col rounded-xl border border-(--kys-line) bg-(--kys-ground) p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <Link
          href={bankHref('songs', s.id)}
          className="min-w-0 text-left leading-snug font-semibold hover:underline"
        >
          {s.title}
        </Link>
        <span className="shrink-0 font-mono text-xs text-(--kys-faint)">{s.year}</span>
      </div>
      {!hideArtist && (
        <p className="text-[14px] leading-snug text-(--kys-text)/90">
          <Credits ids={s.artists} names={names} />
        </p>
      )}
      {s.parts.map((p, k) => (
        <Part key={k} p={p} names={names} />
      ))}
    </li>
  );
}

function Part({ p, names }: { p: BankPart; names: BankNames }) {
  return (
    <div className="mt-1.5">
      <p className="kys-label text-(--kys-muted)">
        Played on: <span className="text-(--kys-text)">{p.on}</span>
      </p>
      <p className="mt-1 text-[14px] leading-relaxed text-(--kys-muted)">{p.text}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {p.instruments.flatMap((id) => {
          const name = names.instruments.get(id);
          return name
            ? [
                <Link
                  key={id}
                  href={bankHref('instruments', id)}
                  className="rounded border border-(--kys-line) px-1.5 py-0.5 text-xs text-(--kys-muted) hover:border-(--kys-muted) hover:text-(--kys-text)"
                >
                  {name}
                </Link>,
              ]
            : [];
        })}
      </div>
      {Object.entries(p.sounds ?? {}).map(([sid, soundId]) => {
        const synth = names.synths.get(sid);
        const sound = names.sounds[sid]?.[soundId];
        return (
          synth &&
          sound && (
            <Link
              key={sid}
              href={soundHref(sid, soundId)}
              className="mt-2 block rounded-md border border-(--kys-line) px-2.5 py-1 text-left text-sm text-(--kys-muted) hover:border-(--kys-muted) hover:text-(--kys-text)"
            >
              Load a sound in this style on the {synth.name}:{' '}
              <span className="text-(--kys-text)">{sound}</span>
            </Link>
          )
        );
      })}
    </div>
  );
}

export function ArtistPage({ d, names }: { d: ArtistDetail; names: BankNames }) {
  const a = d.artist;
  const over = line([a.kind === 'group' ? 'Group' : a.roles.join(', '), a.country, a.active]);
  return (
    <article>
      <Head over={over} name={a.name} line={a.summary} />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {d.eras.map((e) => (
          <span
            key={e}
            className="rounded bg-(--kys-accent)/12 px-1.5 py-0.5 font-mono text-xs text-(--kys-accent)"
          >
            {e}
          </span>
        ))}
        {a.genres.map((g) => (
          <span
            key={g}
            className="rounded border border-(--kys-line) px-1.5 py-0.5 text-xs text-(--kys-muted)"
          >
            {g}
          </span>
        ))}
      </div>
      <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-(--kys-text)/90">
        {a.story}
      </p>
      <Innovations title="What they did differently" items={a.innovations} />
      {/* The prototype put both under one heading, which mislabels a group that is also in a group. */}
      {d.members.length > 0 && (
        <Section title="Members in the databank">
          <PeopleChips tab="artists" people={d.members} />
        </Section>
      )}
      {d.groups.length > 0 && (
        <Section title="Member of">
          <PeopleChips tab="artists" people={d.groups} />
        </Section>
      )}
      {d.songs.length > 0 && (
        <Section title={`Records (${d.songs.length})`}>
          <ul className="grid gap-2 xl:grid-cols-2">
            {d.songs.map((s) => (
              <SongCard
                key={s.id}
                s={s}
                names={names}
                // Their own record needs no credit; one they only played a part on does.
                hideArtist={s.artists.length === 1 && s.artists[0] === a.id}
              />
            ))}
          </ul>
        </Section>
      )}
      {d.instruments.length > 0 && (
        <Section title="Synths">
          <InstrumentChips items={d.instruments} />
        </Section>
      )}
    </article>
  );
}

export function MakerPage({
  d,
  bank,
  names,
}: {
  d: MakerDetail;
  bank: Pick<Bank, 'instruments'>;
  names: BankNames;
}) {
  const m = d.maker;
  const full = new Map(bank.instruments.map((i) => [i.id, i]));
  const over = line([m.born && `${m.born}–${m.died ?? ''}`, m.country, m.companies.join(', ')]);
  return (
    <article>
      <Head over={over} name={m.name} line={m.summary} />
      <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-(--kys-text)/90">
        {m.story}
      </p>
      <Innovations title="What they introduced" items={m.innovations} />
      {d.instruments.length > 0 && (
        <Section title="Instruments">
          <ul className="grid gap-2 xl:grid-cols-2">
            {d.instruments.map((ref) => {
              const i = full.get(ref.id);
              return (
                <li
                  key={ref.id}
                  className="rounded-xl border border-(--kys-line) bg-(--kys-ground) p-3.5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <Link
                      href={bankHref('instruments', ref.id)}
                      className="text-left leading-snug font-semibold hover:underline"
                    >
                      {ref.name}
                    </Link>
                    <span className="shrink-0 font-mono text-xs text-(--kys-faint)">
                      {ref.year}
                    </span>
                  </div>
                  {i && (
                    <p className="mt-1 text-[14px] leading-relaxed text-(--kys-muted)">{i.text}</p>
                  )}
                  {i?.app?.some((sid) => names.synths.has(sid)) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <AppLinks synths={i.app} names={names} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </article>
  );
}

export function SongPage({ d, names }: { d: SongDetail; names: BankNames }) {
  const s = d.song;
  return (
    <article>
      <Head over={line([KIND[s.kind], s.year, s.album])} name={s.title} />
      <p className="mt-2 text-[16px]">
        {s.credit && <span className="text-(--kys-muted)">{s.credit} — </span>}
        <Credits ids={s.artists} names={names} strong />
      </p>
      <div className="mt-4 max-w-[70ch]">
        {s.parts.map((p, k) => (
          <Part key={k} p={p} names={names} />
        ))}
      </div>
    </article>
  );
}

export function InstrumentPage({ d, names }: { d: InstrumentDetail; names: BankNames }) {
  const i = d.instrument;
  return (
    <article>
      <Head over={line([i.maker, i.year, i.kind])} name={i.name} line={i.text} />
      {d.recreationOf && (
        <p className="mt-3 text-[15px]">
          A recreation of the{' '}
          <Link
            href={bankHref('instruments', d.recreationOf.id)}
            className="font-semibold text-(--kys-accent) hover:underline"
          >
            {d.recreationOf.name}
          </Link>{' '}
          <span className="text-(--kys-muted)">
            ({line([d.recreationOf.maker, d.recreationOf.year])})
          </span>
        </p>
      )}
      {d.synths.some((sid) => names.synths.has(sid)) && (
        <div className="mt-3 flex flex-wrap gap-2">
          <AppLinks synths={d.synths} names={names} />
        </div>
      )}
      {d.people.length > 0 && (
        <Section title="The people behind it">
          <PeopleChips tab="makers" people={d.people} />
        </Section>
      )}
      {d.songs.length > 0 && (
        <Section title={`Heard on (${d.songs.length})`}>
          <ul className="grid gap-2 xl:grid-cols-2">
            {d.songs.map((s) => (
              <SongCard key={s.id} s={s} names={names} />
            ))}
          </ul>
        </Section>
      )}
      {d.artists.length > 0 && (
        <Section title="Artists who used one">
          <PeopleChips tab="artists" people={d.artists} />
        </Section>
      )}
      {d.recreations.length > 0 && (
        <Section title="Recreations">
          <InstrumentChips items={d.recreations} />
        </Section>
      )}
    </article>
  );
}
