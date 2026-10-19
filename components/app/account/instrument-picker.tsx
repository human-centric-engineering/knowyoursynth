'use client';

import { Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
import { z } from 'zod';

import { SuggestForm } from '@/components/app/bank/suggest-form';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api/client';
import { LIST_NAMES, type OwnedKind } from '@/lib/app/profile/instruments-data';

/** An instrument as `GET /api/v1/bank/instruments` lists it: outside data, so checked. */
const InstrumentRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  maker: z.string(),
  year: z.string(),
});
type InstrumentRef = z.infer<typeof InstrumentRefSchema>;

/** How many matches show at once; the rest are a narrower search away. */
const SHOWN = 8;

/** Lower-case, with accents dropped, so "korg ms" finds the MS-20 and "Jupiter" finds "Júpiter". */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Every word of the search somewhere in the instrument's name or maker. */
export function matchInstruments(all: InstrumentRef[], query: string): InstrumentRef[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return all.filter((i) => {
    const text = fold(`${i.name} ${i.maker}`);
    return words.every((w) => text.includes(w));
  });
}

interface InstrumentPickerProps {
  /** The list each instrument already on one is on. */
  listed: ReadonlyMap<string, OwnedKind>;
  /** Put it on a list. Resolves once the API has answered. */
  onAdd: (instrumentId: string, kind: OwnedKind) => Promise<void>;
  disabled?: boolean;
}

/**
 * Search the databank for a synth to add (`f-profiles` r2). The whole instrument list (about 940) is read once, the
 * first time the search is used, and filtered here: small enough that a search parameter on the route would buy
 * nothing. A synth that isn't there can be suggested, beside the search.
 */
export function InstrumentPicker({ listed, onAdd, disabled }: InstrumentPickerProps) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [all, setAll] = useState<InstrumentRef[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load() {
    if (all || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const parsed = z
        .array(InstrumentRefSchema)
        .safeParse(await apiClient.get('/api/v1/bank/instruments'));
      if (parsed.success) setAll(parsed.data);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const matches = all ? matchInstruments(all, query) : [];
  const searched = query.trim() !== '';

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={inputId} className="flex items-center gap-1">
          Add a synth
          <FieldHelp title="Add a synth">
            Search the databank by name or maker, such as &quot;juno&quot; or &quot;korg ms&quot;,
            then say whether you own it or want it. A synth is on one list or the other; you can
            move it later.
          </FieldHelp>
        </Label>
        <Input
          id={inputId}
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search the databank"
          value={query}
          onFocus={() => void load()}
          onChange={(e) => {
            setQuery(e.target.value);
            void load();
          }}
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the databank…
        </p>
      ) : null}
      {failed ? (
        <p className="text-sm" role="alert">
          The databank didn&apos;t load.{' '}
          <button type="button" className="underline" onClick={() => void load()}>
            Try again
          </button>
        </p>
      ) : null}

      {all && searched ? (
        matches.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No synth in the databank matches that. Try the maker&apos;s name, or part of the model
            name.
          </p>
        ) : (
          <ul aria-label="Matching synths" className="divide-border divide-y rounded-md border">
            {matches.slice(0, SHOWN).map((i) => {
              const on = listed.get(i.id);
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
                  <span className="text-sm">
                    {i.name}{' '}
                    <span className="text-muted-foreground">
                      · {i.maker} · {i.year}
                    </span>
                  </span>
                  {on ? (
                    <span className="text-muted-foreground text-sm">On {LIST_NAMES[on]}</span>
                  ) : (
                    <span className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        aria-label={`I own ${i.name}`}
                        onClick={() => void onAdd(i.id, 'owned')}
                      >
                        I own it
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        aria-label={`I want ${i.name}`}
                        onClick={() => void onAdd(i.id, 'wishlist')}
                      >
                        I want it
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
            {matches.length > SHOWN ? (
              <li className="text-muted-foreground p-2 text-sm">
                {matches.length - SHOWN} more. Add a word to narrow it.
              </li>
            ) : null}
          </ul>
        )
      ) : null}

      <SuggestForm />
    </div>
  );
}
