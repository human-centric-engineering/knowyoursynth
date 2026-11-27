'use client';

/**
 * A databank instrument nobody has modelled, in the synth's place (`f-synth-picker` t-330): the synth picker in the
 * caption, naming the instrument, and in the panel's place what the databank knows about it. Nothing here plays.
 *
 * - **What it is**: maker, year, kind and the databank's description.
 * - **Where it sits**: what it recreates and what recreates it, each a link to that synth's page when it plays, or its
 *   own page here when it does not; and the nearest one that plays, as the first action.
 * - **Who played it** and the records it is heard on, from the databank.
 * - **Three actions**: I own this (`/api/v1/me/instruments`), Ask for it to be modelled (`/api/v1/me/model-requests`),
 *   and Open in the databank (its `/bank` page). Signed out, the first two say to sign in.
 *
 * See `.context/app/synth-picker.md`.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

import { bankHref } from '@/components/app/bank/routes';
import { useOwnedInstruments } from '@/components/app/synth/family-toggle';
import { memberHref, synthAboutHref, synthHref } from '@/components/app/synth/routes';
import { useSettings } from '@/components/app/synth/settings';
import { SynthPicker } from '@/components/app/synth/synth-picker';
import { apiClient } from '@/lib/api/client';
import { useSession } from '@/lib/auth/client';
import type { InstrumentDetail, InstrumentRef } from '@/lib/app/bank/read';
import { OwnedListsSchema } from '@/lib/app/profile/instruments-data';
import type { CatalogueSynth } from '@/lib/app/catalogue/read';
import type { SynthFamily } from '@/lib/app/families/read';
import type { SitePickerSettings } from '@/lib/app/picker/settings';
import { logger } from '@/lib/logging';

export interface InstrumentAboutProps {
  detail: InstrumentDetail;
  synths: CatalogueSynth[];
  families: SynthFamily[];
  pickerSite: SitePickerSettings;
  /** Databank instrument id → the listed synth it plays as. */
  playsAs: Record<string, string>;
}

const RequestSchema = z.object({ asked: z.boolean(), count: z.number().int().nonnegative() });

type OwnState = 'owned' | 'wishlist' | 'none';

/** Where a relative goes: its synth's page when it plays, else its own page here. */
function relativeHref(ref: InstrumentRef, playsAs: Record<string, string>): string {
  const synth = playsAs[ref.id];
  return synth ? synthHref(synth) : synthAboutHref(ref.id);
}

function Relatives({
  label,
  refs,
  playsAs,
}: {
  label: string;
  refs: InstrumentRef[];
  playsAs: Record<string, string>;
}) {
  if (!refs.length) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="kys-label text-(--kys-faint)">{label}</span>
      <ul className="flex flex-wrap gap-1.5">
        {refs.map((r) => (
          <li key={r.id}>
            <Link
              href={relativeHref(r, playsAs)}
              className={`inline-block rounded-md border px-2 py-0.5 text-sm hover:border-(--kys-muted) ${playsAs[r.id] ? 'border-(--kys-good)/60' : 'border-(--kys-line)'}`}
            >
              {r.maker.split(' ')[0]} {r.name}
              {playsAs[r.id] && <span className="text-(--kys-good)"> · plays</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InstrumentAbout({
  detail,
  synths,
  families,
  pickerSite,
  playsAs,
}: InstrumentAboutProps) {
  const router = useRouter();
  const { data: auth } = useSession();
  const userId = auth?.user.id ?? null;
  const settings = useSettings(userId);
  const owned = useOwnedInstruments(families.length ? userId : null);
  const { instrument, recreationOf, recreations, artists, songs } = detail;
  const id = instrument.id;

  const [own, setOwn] = useState<OwnState | null>(null);
  // Whether it was on the wishlist when the user said they own it: taking that back puts it back there.
  const [wasWished, setWasWished] = useState(false);
  const [request, setRequest] = useState<z.infer<typeof RequestSchema> | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // What the signed-in user has done with it already: each read on its own, so one that fails leaves the other's
  // button working, and says so.
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    const failed = (what: string) => (err: unknown) => {
      logger.warn(`instrument page: could not read ${what}`, { err: String(err) });
      if (live)
        setProblem('Some of what you have done here could not be read. Reload to try again.');
    };
    apiClient
      .get<unknown>('/api/v1/me/instruments')
      .then((lists) => {
        if (!live) return;
        const l = OwnedListsSchema.parse(lists);
        setOwn(
          l.owned.some((e) => e.instrumentId === id)
            ? 'owned'
            : l.wishlist.some((e) => e.instrumentId === id)
              ? 'wishlist'
              : 'none'
        );
      })
      .catch(failed('your synths'));
    apiClient
      .get<unknown>(`/api/v1/me/model-requests/${encodeURIComponent(id)}`)
      .then((asked) => {
        if (live) setRequest(RequestSchema.parse(asked));
      })
      .catch(failed('your request'));
    return () => {
      live = false;
    };
  }, [userId, id]);

  const act = async (what: () => Promise<void>, failed: string) => {
    setBusy(true);
    setProblem(null);
    try {
      await what();
    } catch (err) {
      logger.warn('instrument page: action failed', { err: String(err) });
      setProblem(failed);
    } finally {
      setBusy(false);
    }
  };

  const toggleOwned = () =>
    act(async () => {
      const path = `/api/v1/me/instruments/${encodeURIComponent(id)}`;
      if (own === 'owned') {
        // Taking it back: to the wishlist it came from, else off both lists.
        if (wasWished) await apiClient.patch(path, { body: { kind: 'wishlist' } });
        else await apiClient.delete(path);
        setOwn(wasWished ? 'wishlist' : 'none');
        setWasWished(false);
        return;
      }
      if (own === 'wishlist') await apiClient.patch(path, { body: { kind: 'owned' } });
      else
        await apiClient.post('/api/v1/me/instruments', {
          body: { instrumentId: id, kind: 'owned' },
        });
      setWasWished(own === 'wishlist');
      setOwn('owned');
    }, 'Your synths could not be changed. Try again.');

  const toggleRequest = () =>
    act(async () => {
      const path = `/api/v1/me/model-requests/${encodeURIComponent(id)}`;
      const answer = request?.asked
        ? await apiClient.delete<unknown>(path)
        : await apiClient.put<unknown>(path);
      setRequest(RequestSchema.parse(answer));
    }, 'Your request could not be saved. Try again.');

  // The nearest that plays: what it recreates, else the first of what recreates it.
  const nearest = [recreationOf, ...recreations].find(
    (r): r is InstrumentRef => !!r && !!playsAs[r.id]
  );
  const signInHref = `/login?callbackUrl=${encodeURIComponent(synthAboutHref(id))}`;
  const paragraphs = instrument.text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="kys-synth mx-auto flex w-full max-w-[1720px] flex-col gap-5 px-4 pt-4 pb-10 sm:px-6">
      <header className="flex flex-wrap items-end gap-x-5 gap-y-1">
        <h1 className="sr-only">
          {instrument.maker} {instrument.name}
        </h1>
        <SynthPicker
          variant="caption"
          synths={synths}
          families={families}
          owned={owned}
          // No synth is open here: a family member chosen opens over the one the user owns, or its default.
          synthId=""
          caption={{ name: instrument.name, maker: instrument.maker }}
          instrumentId={id}
          onSelect={(synth) => router.push(synthHref(synth))}
          onSelectMember={(over, slug) => router.push(memberHref(over, slug))}
          onSelectInstrument={(other) => router.push(synthAboutHref(other))}
          site={pickerSite}
          prefs={settings.picker[0]}
          onPrefs={settings.picker[1]}
        />
      </header>

      <section
        aria-label={`${instrument.maker} ${instrument.name}, not modelled`}
        className="kys-synth-shadow mx-auto flex w-full max-w-[1100px] flex-col gap-5 rounded-lg border border-(--kys-line) bg-(--kys-surface) px-6 py-8 sm:px-10"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="kys-sound-title">
            {instrument.maker} {instrument.name}
          </h2>
          <span className="text-sm text-(--kys-muted)">{instrument.year}</span>
          <span className="kys-label rounded border border-(--kys-line) px-1.5 text-[11px] text-(--kys-faint)">
            {instrument.kind}
          </span>
        </div>
        <p className="kys-label text-(--kys-faint)">Not modelled yet: nothing here plays.</p>
        <div className="flex max-w-[68ch] flex-col gap-3 text-[15px] leading-relaxed text-(--kys-text)">
          {paragraphs.map((p, i) => (
            // A static list, and a paragraph may repeat: keyed by place.
            <p key={i}>{p}</p>
          ))}
        </div>

        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Relatives
            label="A recreation of"
            refs={recreationOf ? [recreationOf] : []}
            playsAs={playsAs}
          />
          <Relatives label="Copies, reissues and revisions" refs={recreations} playsAs={playsAs} />
          {artists.length > 0 && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="kys-label text-(--kys-faint)">Played by</span>
              <p className="text-sm">
                {artists.map((a, i) => (
                  <span key={a.id}>
                    {i > 0 && ', '}
                    <Link href={bankHref('artists', a.id)} className="hover:underline">
                      {a.name}
                    </Link>
                  </span>
                ))}
              </p>
            </div>
          )}
          {songs.length > 0 && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="kys-label text-(--kys-faint)">Heard on</span>
              <p className="text-sm">
                {songs
                  .slice(0, 8)
                  .map((s) => `${s.who} — ${s.title}`)
                  .join(' · ')}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {nearest && (
            <Link
              href={relativeHref(nearest, playsAs)}
              className="kys-label rounded-lg border border-(--kys-accent) bg-(--kys-accent) px-3 py-2 text-[12px] text-(--kys-accent-ink)"
            >
              Play the nearest: {nearest.name}
            </Link>
          )}
          {userId ? (
            <>
              <button
                type="button"
                aria-pressed={own === 'owned'}
                disabled={busy || own === null}
                onClick={() => void toggleOwned()}
                className="kys-label rounded-lg border border-(--kys-line) px-3 py-2 text-[12px] disabled:opacity-60 aria-pressed:bg-(--kys-text) aria-pressed:text-(--kys-raised)"
              >
                {own === 'owned' ? 'You own this' : 'I own this'}
              </button>
              <button
                type="button"
                aria-pressed={!!request?.asked}
                disabled={busy || request === null}
                onClick={() => void toggleRequest()}
                className="kys-label rounded-lg border border-(--kys-line) px-3 py-2 text-[12px] disabled:opacity-60 aria-pressed:bg-(--kys-text) aria-pressed:text-(--kys-raised)"
              >
                {request?.asked ? 'You asked for it to be modelled' : 'Ask for it to be modelled'}
              </button>
            </>
          ) : (
            <Link href={signInHref} className="text-sm text-(--kys-accent) hover:underline">
              Sign in to say you own it, or to ask for it to be modelled
            </Link>
          )}
          <Link
            href={bankHref('instruments', id)}
            className="kys-label rounded-lg border border-(--kys-line) px-3 py-2 text-[12px]"
          >
            Open in the databank
          </Link>
        </div>
        {request && request.count > 0 && (
          <p className="text-sm text-(--kys-muted)">
            {request.count === 1
              ? '1 person has asked for it to be modelled.'
              : `${request.count} people have asked for it to be modelled.`}
          </p>
        )}
        {problem && (
          <p role="alert" className="text-sm text-(--kys-warn)">
            {problem}
          </p>
        )}
      </section>
    </div>
  );
}
