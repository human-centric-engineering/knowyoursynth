/**
 * Where a tutor answer came from (`f-tutor-knowledge` t-60): the databank rows and web pages a turn's searches found,
 * read from what `search_databank` and `web_search` returned. Pure, and free of server imports, so the panel reads a
 * live turn's results with it and the conversation read (`lib/app/tutor/conversation.ts`) reads a stored turn's.
 *
 * **A result is untrusted until it is read here.** A `capability_result` frame's `result` is `unknown`, and a stored
 * tool message is JSON the panel did not write. A source counts only if it parses: a databank row only with an href
 * that is one of `/bank`'s own pages, and a web result only with an http(s) URL, so a `javascript:` or `data:` link
 * never reaches an `<a>`. A refused search carries no data, so it has no sources.
 */
import { z } from 'zod';
import { isBankTab } from '@/components/app/bank/routes';
// Type only: this module reaches the browser, and the read layer holds the database client.
import type { BankKind } from '@/lib/app/bank/read';

/** The tools whose results are sources. */
export const SOURCE_TOOLS = ['search_databank', 'web_search'] as const;

const DatabankSourceSchema = z
  .object({
    type: z.literal('databank'),
    kind: z.custom<BankKind>((v) => typeof v === 'string' && isBankTab(v)),
    name: z.string().min(1),
    href: z.string().regex(/^\/bank\/[a-z]+\/[a-z0-9-]+$/),
  })
  // The href is the page of the row it names.
  .refine((s) => s.href.startsWith(`/bank/${s.kind}/`));

const WebSourceSchema = z.object({
  type: z.literal('web'),
  title: z.string().min(1),
  url: z.url({ protocol: /^https?$/ }),
});

export const TutorSourceSchema = z.union([DatabankSourceSchema, WebSourceSchema]);
export type TutorSource = z.infer<typeof TutorSourceSchema>;

const ResultSchema = z.object({
  success: z.literal(true),
  data: z.object({ results: z.array(z.unknown()) }),
});

/** A tool's row as a source: only the fields a source has, then held to the source's own rules. */
const DatabankRowSchema = z
  .object({ kind: z.string(), name: z.string(), href: z.string() })
  .transform((r) => ({ type: 'databank' as const, kind: r.kind, name: r.name, href: r.href }))
  .pipe(DatabankSourceSchema);
const WebRowSchema = z
  .object({ title: z.string(), url: z.string() })
  .transform((r) => ({ type: 'web' as const, title: r.title, url: r.url }))
  .pipe(WebSourceSchema);

/** The sources in one tool result, or none: another tool, a refusal, or rows that do not parse. */
export function readSources(capabilitySlug: string, result: unknown): TutorSource[] {
  if (capabilitySlug !== 'search_databank' && capabilitySlug !== 'web_search') return [];
  const parsed = ResultSchema.safeParse(result);
  if (!parsed.success) return [];
  const row = capabilitySlug === 'search_databank' ? DatabankRowSchema : WebRowSchema;
  return parsed.data.data.results.flatMap((r): TutorSource[] => {
    const source = row.safeParse(r);
    return source.success ? [source.data] : [];
  });
}

const keyOf = (s: TutorSource) => (s.type === 'databank' ? s.href : s.url);

/** `next` added to `prev`, each source once, in the order they were found. */
export function addSources(prev: TutorSource[], next: TutorSource[]): TutorSource[] {
  const seen = new Set(prev.map(keyOf));
  const added = next.filter((s) => {
    const key = keyOf(s);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return added.length ? [...prev, ...added] : prev;
}
