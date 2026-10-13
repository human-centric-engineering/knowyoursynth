/**
 * How the catalogue editor shows a refused save (`f-catalogue-admin`): the server's problems on the fields they name.
 *
 * Every catalogue write refuses in one shape, a 400 whose `details.errors` is a list of `{ path, message }`, the path
 * dot-separated (`steps.2.set.cutoff`, `timeline.0.text`). A form names the keys it has a place for, and each problem
 * goes to the longest key its path starts with, so a problem deep inside a step's values lands on that step's values.
 * Whatever no field claims is listed with the refusal's message, so nothing the server said is dropped.
 */
import { z } from 'zod';

import { APIClientError } from '@/lib/api/client';

export interface Problem {
  path: string;
  message: string;
}

/** A refused save: the server's message, and its problems where it sent any. */
export interface Refusal {
  message: string;
  problems: Problem[];
}

const DetailsSchema = z.object({
  errors: z.array(z.object({ path: z.string().catch(''), message: z.string() })),
});

/** What a failed request said. Anything that is not an API refusal reads as `fallback`. */
export function refusalOf(err: unknown, fallback: string): Refusal {
  if (!(err instanceof APIClientError)) return { message: fallback, problems: [] };
  const details = DetailsSchema.safeParse(err.details);
  return { message: err.message, problems: details.success ? details.data.errors : [] };
}

export interface PlacedProblems {
  /** The messages for one field's key. */
  at: (key: string) => string[];
  /** Problems no field claimed. */
  unplaced: Problem[];
}

/** Put each problem on the longest of `keys` its path is, or starts with. */
export function placeProblems(problems: Problem[], keys: Iterable<string>): PlacedProblems {
  const known = [...new Set(keys)].filter(Boolean).sort((a, b) => b.length - a.length);
  const byKey = new Map<string, string[]>();
  const unplaced: Problem[] = [];
  for (const problem of problems) {
    const key = known.find((k) => problem.path === k || problem.path.startsWith(`${k}.`));
    if (key === undefined) unplaced.push(problem);
    else byKey.set(key, [...(byKey.get(key) ?? []), problem.message]);
  }
  return { at: (key) => byKey.get(key) ?? [], unplaced };
}

/** A field's problems, under it. Renders nothing when there are none. */
export function FieldProblems({ id, messages }: { id?: string; messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <ul id={id} role="alert" className="text-destructive space-y-0.5 text-xs">
      {messages.map((message, i) => (
        <li key={i}>{message}</li>
      ))}
    </ul>
  );
}

/** The refusal's message, with whatever no field claimed. */
export function RefusalSummary({
  refusal,
  unplaced,
}: {
  refusal: Refusal | null;
  unplaced: Problem[];
}) {
  if (!refusal) return null;
  return (
    <div
      role="alert"
      className="border-destructive/50 text-destructive rounded-md border p-3 text-sm"
    >
      <p className="font-medium">{refusal.message}</p>
      {refusal.problems.length > unplaced.length && (
        <p className="mt-1 text-xs">Each field the server named shows what to fix.</p>
      )}
      {unplaced.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs">
          {unplaced.map((p, i) => (
            <li key={i}>
              {p.path && <code className="mr-1">{p.path}</code>}
              {p.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
