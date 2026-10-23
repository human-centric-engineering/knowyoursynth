/**
 * The tutor's eval graders (`f-tutor-knowledge` t-61): whether it sources its answers and stays on topic, scored on
 * each case of the tutor's dataset (`prisma/seeds/app-knowyoursynth/data/tutor-evals.json`). Registered from
 * `lib/app/evaluations.ts`.
 *
 * **Deterministic, not judge agents.** The scores are read for regressions after a change to the instructions or the
 * model, and a judge adds its own variance to that number (the seam's own note).
 *
 * **What a grader reads.** Sunrise passes a grader the case's question, the answer, the case's `expectedOutput` and the
 * turn's tool calls; nothing else of the case. So a case's expectation is its `expectedOutput`, as JSON
 * (`TutorExpectationSchema`). What a search returned is the call's `resultPreview`, which `search_databank` and
 * `web_search` write as the links the panel would show (`sourcesPreview`), with its `success` flag: a seam Know Your
 * Synth carries in Sunrise's eval worker (`.context/app/divergences.md`).
 *
 * **A grader that does not apply scores null**, with no `passed`, so the run's stats leave the case out rather than
 * count it a pass. Each grader says which cases it covers.
 */
import { z } from 'zod';
import { SourcesPreviewSchema } from '@/lib/app/tutor/sources';
import { tryParseJson } from '@/lib/orchestration/evaluations/parse-structured';
import type {
  Grader,
  GraderInput,
  GraderResult,
} from '@/lib/orchestration/evaluations/graders/types';

/** What a case asks of the tutor. `rows` are the databank pages of which the search must find at least one. */
export const TutorExpectationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.enum(['databank', 'meaning']),
      rows: z.array(z.string().regex(/^\/bank\/[a-z]+\/[a-z0-9-]+$/)).min(1),
    })
    .strict(),
  z.object({ kind: z.enum(['web', 'general', 'off_topic', 'pattern']) }).strict(),
]);
export type TutorExpectation = z.infer<typeof TutorExpectationSchema>;

type ToolCall = NonNullable<GraderInput['toolCalls']>[number];

const SEARCH_TOOLS = ['search_databank', 'web_search'];

/** The links a successful search returned, or `null` for a call that refused or left no preview. */
function linksOf(call: ToolCall): string[] | null {
  if (call.success !== true || !call.resultPreview) return null;
  return tryParseJson(
    call.resultPreview,
    (v) => SourcesPreviewSchema.safeParse(v).data?.links ?? null
  );
}

function callsTo(input: GraderInput, slug: string): ToolCall[] {
  return (input.toolCalls ?? []).filter((c) => c.slug === slug);
}

function expectationOf(input: GraderInput): TutorExpectation | null {
  if (!input.expectedOutput) return null;
  return tryParseJson(
    input.expectedOutput,
    (v) => TutorExpectationSchema.safeParse(v).data ?? null
  );
}

const notApplicable = (reasoning: string): GraderResult => ({ score: null, reasoning });
const verdict = (pass: boolean, reasoning: string): GraderResult => ({
  score: pass ? 1 : 0,
  passed: pass,
  reasoning,
});

const configSchema = z.object({}).strict();
type Config = z.infer<typeof configSchema>;

/**
 * Databank cases: a `search_databank` call found one of the case's rows, so the panel lists it under the answer with
 * its link.
 */
export function gradeDatabankFound(input: GraderInput): GraderResult {
  const expected = expectationOf(input);
  if (expected?.kind !== 'databank' && expected?.kind !== 'meaning') {
    return notApplicable('Not a databank case.');
  }
  const calls = callsTo(input, 'search_databank');
  if (calls.length === 0) return verdict(false, 'search_databank was not called.');
  const found = calls.flatMap((c) => linksOf(c) ?? []);
  const hit = expected.rows.find((row) => found.includes(row));
  if (hit) return verdict(true, `Found and linked ${hit}.`);
  return verdict(
    false,
    `Expected one of ${expected.rows.join(', ')}; the searches found ${found.length ? found.join(', ') : 'nothing'}.`
  );
}

/**
 * Any case where `web_search` ran, and web cases: a search returned at least one link. A web case whose searches all
 * refused (search not set up, the allowance spent, Brave failing) scores null: that is the environment, not the tutor.
 */
export function gradeWebLinks(input: GraderInput): GraderResult {
  const expected = expectationOf(input);
  const calls = callsTo(input, 'web_search');
  if (calls.length === 0) {
    return expected?.kind === 'web'
      ? verdict(false, 'web_search was not called for a question the databank does not answer.')
      : notApplicable('web_search did not run.');
  }
  const answered = calls.map(linksOf).filter((links): links is string[] => links !== null);
  if (answered.length === 0) {
    const codes = calls.map((c) => c.errorCode ?? 'unknown').join(', ');
    return notApplicable(`web_search ran but every call refused (${codes}).`);
  }
  const links = answered.flat();
  return links.length > 0
    ? verdict(true, `web_search returned ${links.length} link(s).`)
    : verdict(false, 'web_search ran and returned no links.');
}

/**
 * The instructions' wording is "say briefly that it is outside what you do". These are the ways a model words that;
 * a decline in other words fails, and the reasoning quotes the answer so a run shows which.
 */
// ['’]: a model writes either apostrophe.
const DECLINE =
  /outside (?:of )?(?:what I (?:do|cover|can help with)|my (?:area|remit|scope))|(?:not|n['’]t) something I (?:can )?(?:help|answer|cover)|I (?:can|could) only (?:help|answer|talk)|I(?:['’]m| am) (?:only here|here|only able) to help with (?:music|sound|synth)/i;
/** "Briefly": a decline with an answer to the question after it is not a decline. */
export const DECLINE_MAX_CHARS = 500;

/** Off-topic cases: the answer declines, briefly, and nothing was searched. */
export function gradeDeclinedOffTopic(input: GraderInput): GraderResult {
  if (expectationOf(input)?.kind !== 'off_topic') return notApplicable('Not an off-topic case.');
  const searched = (input.toolCalls ?? []).filter((c) => SEARCH_TOOLS.includes(c.slug));
  if (searched.length > 0) {
    return verdict(
      false,
      `Searched for an off-topic question (${searched.map((c) => c.slug).join(', ')}).`
    );
  }
  const answer = input.modelOutput.trim();
  if (!DECLINE.test(answer)) return verdict(false, `No decline in: "${answer.slice(0, 200)}"`);
  if (answer.length > DECLINE_MAX_CHARS) {
    return verdict(
      false,
      `Declined, but at ${answer.length} characters (over ${DECLINE_MAX_CHARS}).`
    );
  }
  return verdict(true, 'Declined without searching.');
}

/**
 * Pattern cases (t-84): a request for a riff, a bassline or a beat ends with a pattern the sequencer can load, so a
 * `propose_pattern` call came back with one. An eval run sends no panel and no pattern, so these cases ask for new
 * patterns only; an edit to the open one is the owner's check in the app.
 */
export function gradePatternProposed(input: GraderInput): GraderResult {
  if (expectationOf(input)?.kind !== 'pattern') return notApplicable('Not a pattern case.');
  const calls = callsTo(input, 'propose_pattern');
  if (calls.length === 0) return verdict(false, 'propose_pattern was not called.');
  if (calls.some((c) => c.success === true)) return verdict(true, 'Proposed a pattern.');
  const codes = calls.map((c) => c.errorCode ?? 'unknown').join(', ');
  return verdict(false, `propose_pattern was called but every call refused (${codes}).`);
}

const OWN_KNOWLEDGE = /\bown knowledge\b|\bfrom (?:my )?memory\b/i;

/**
 * Unsourced answers: a turn whose searches found nothing (refusals included), or a databank or web case answered with no
 * search at all, says it is from the tutor's own knowledge. A general or off-topic question answered without searching
 * needs no label: the instructions send it no search.
 */
export function gradeOwnKnowledgeLabelled(input: GraderInput): GraderResult {
  const expected = expectationOf(input);
  const searches = (input.toolCalls ?? []).filter((c) => SEARCH_TOOLS.includes(c.slug));
  const sourced = searches.some((c) => (linksOf(c) ?? []).length > 0);
  if (sourced) return notApplicable('The turn has sources.');
  const needsSource =
    expected?.kind === 'databank' || expected?.kind === 'meaning' || expected?.kind === 'web';
  if (searches.length === 0 && !needsSource)
    return notApplicable('Nothing was searched, and the question needs no search.');
  return OWN_KNOWLEDGE.test(input.modelOutput)
    ? verdict(true, 'Unsourced, and says it is from its own knowledge.')
    : verdict(false, 'Unsourced, and does not say it is from its own knowledge.');
}

function grader(
  slug: string,
  description: string,
  grade: (input: GraderInput) => GraderResult
): Grader<Config> {
  return {
    slug,
    family: 'heuristic',
    // Each reads its case's expectation, but a case without one is simply out of scope, so none blocks a run.
    referenceRequired: false,
    configSchema,
    defaultConfig: {},
    // Async signature required by the Grader interface; the bodies are sync.
    // eslint-disable-next-line @typescript-eslint/require-await
    grade: async (input) => grade(input),
    description,
  };
}

export const TUTOR_GRADERS: readonly Grader<Config>[] = [
  grader(
    'tutor_databank_found',
    "Tutor: on a databank question, search_databank found one of the case's rows, so the answer lists it with its link.",
    gradeDatabankFound
  ),
  grader(
    'tutor_web_links',
    'Tutor: when web_search ran, or the question needs the web, the search returned at least one link.',
    gradeWebLinks
  ),
  grader(
    'tutor_declined_off_topic',
    'Tutor: on an off-topic question, the answer briefly says it is outside what the tutor does, and nothing was searched.',
    gradeDeclinedOffTopic
  ),
  grader(
    'tutor_pattern_proposed',
    'Tutor: on a request for a pattern, propose_pattern came back with one the sequencer can load.',
    gradePatternProposed
  ),
  grader(
    'tutor_own_knowledge',
    'Tutor: an answer no search sourced says it is from the tutor’s own knowledge.',
    gradeOwnKnowledgeLabelled
  ),
];
