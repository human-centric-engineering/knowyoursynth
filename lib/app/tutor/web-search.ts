import { z } from 'zod';
import { TUTOR_AGENT_SLUG } from '@/lib/app/tutor/agent';
import { allowanceSpentMessage, readAllowance, WEB_SEARCH_TOOL } from '@/lib/app/tutor/allowance';
import { prisma } from '@/lib/db/client';
import { env } from '@/lib/env';
import { logger } from '@/lib/logging';
import { platformSlugWhere } from '@/lib/orchestration/agents/platform-agent-guard';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { executeHttpRequest, HttpError } from '@/lib/orchestration/http';
import { cleanInline, extractTextFromHtml } from '@/lib/orchestration/knowledge/parsers/dom-text';

/** Brave's web search endpoint. Its host has to be in `ORCHESTRATION_ALLOWED_HOSTS`, as any outbound call's does. */
export const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';

/**
 * How many results one search returns. The tool loop sends every result again on each later step, so a handful keeps
 * a search near `search_databank`'s size; the first few are the ones worth reading.
 */
const RESULTS = 5;
const MAX_QUERY_LENGTH = 200;
const MAX_TITLE_LENGTH = 150;
const MAX_SNIPPET_LENGTH = 300;
const FAILED =
  "The web search didn't work just now. Answer from your own knowledge, saying so, or suggest asking again later.";
/** Well inside the chat handler's per-tool timeout, so a slow Brave is our refusal, not the handler's. */
const TIMEOUT_MS = 8_000;
/** A page of five results is a few kilobytes; anything near this is not a search result. */
const MAX_RESPONSE_BYTES = 512 * 1024;

const schema = z
  .object({
    query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
  })
  .strict();

type Args = z.infer<typeof schema>;

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchData {
  results: WebSearchResult[];
  /** Said when nothing came back, so the model knows the web had no answer rather than guessing one. */
  note?: string;
}

/** What the tool reads of Brave's reply; everything else in it is dropped. */
const braveReplySchema = z.object({
  web: z.object({ results: z.array(z.unknown()) }).optional(),
});

const braveResultSchema = z.object({
  title: z.string(),
  url: z.url({ protocol: /^https?$/ }),
  description: z.string().optional(),
});

/**
 * Plain text of a title or snippet: parsed as HTML, so Brave's markup goes and every entity is decoded once (an encoded
 * `&amp;lt;` stays the text `&lt;`), whitespace collapsed, and cut by characters, never inside a surrogate pair.
 */
function plain(text: string, max: number): string {
  const chars = Array.from(cleanInline(extractTextFromHtml(text)));
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`
    : chars.join('');
}

/** The tutor as the stream route loads it. The allowance counts only its conversations, so only it may search. */
async function isTutor(agentId: string): Promise<boolean> {
  const n = await prisma.aiAgent.count({
    where: { id: agentId, slug: TUTOR_AGENT_SLUG, ...platformSlugWhere(TUTOR_AGENT_SLUG) },
  });
  return n > 0;
}

/** Brave's reply as at most `limit` results with their three fields, skipping any without a title or a web URL. Pure. */
export function trimBraveResults(body: unknown, limit = RESULTS): WebSearchResult[] | null {
  const reply = braveReplySchema.safeParse(body);
  if (!reply.success) return null;
  const results: WebSearchResult[] = [];
  for (const row of reply.data.web?.results ?? []) {
    const parsed = braveResultSchema.safeParse(row);
    if (!parsed.success) continue;
    const title = plain(parsed.data.title, MAX_TITLE_LENGTH);
    if (!title) continue;
    results.push({
      title,
      url: parsed.data.url,
      snippet: plain(parsed.data.description ?? '', MAX_SNIPPET_LENGTH),
    });
    if (results.length === limit) break;
  }
  return results;
}

/**
 * `web_search`: the web, through Brave's Search API (`f-tutor-knowledge` t-59, D12), for when the databank has no
 * answer. Not a binding of `call_external_api`: there the model writes the URL and reads Brave's raw JSON, and here it
 * writes a query and reads five trimmed results.
 *
 * It goes through Sunrise's outbound HTTP module, so the host allowlist and the per-host rate limit apply as they do to
 * `call_external_api`. Every way it can fail is a refusal with its reason, never a throw: no key, no user, no turns
 * left, an agent other than the tutor, a host not allowed, the database or Brave failing, and Brave timing out. Each
 * search that comes back counts as one of the person's turns for the day (`lib/app/tutor/allowance.ts`), and only the
 * tutor's conversations are counted, so it checks the agent is the tutor and reads the allowance first.
 */
export class WebSearchCapability extends BaseCapability<Args, WebSearchData> {
  readonly slug = WEB_SEARCH_TOOL;
  protected readonly schema = schema;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: WEB_SEARCH_TOOL,
    description:
      "Search the web. Use it only when search_databank has no answer, or for something the databank doesn't cover. Each search uses one of the learner's questions for the day. Returns up to five results, each with a title, a URL and a snippet. Read-only.",
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'What to search for, in a few key words.',
          minLength: 1,
          maxLength: MAX_QUERY_LENGTH,
        },
      },
      required: ['query'],
    },
  };

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<WebSearchData>> {
    // Read per call, not at module scope, so setting the key and restarting is all it takes.
    const key = env.BRAVE_SEARCH_API_KEY;
    if (!key) {
      return this.error(
        "Web search isn't set up on this app. Tell the learner, and answer from your own knowledge, saying so.",
        'web_search_not_configured'
      );
    }
    if (!context.userId) {
      return this.error(
        'Web search needs a signed-in learner, whose daily questions it counts against.',
        'web_search_no_user'
      );
    }

    let allowance;
    try {
      if (!(await isTutor(context.agentId))) {
        return this.error(
          "Web search is the synth tutor's alone: its searches count against the learner's daily questions.",
          'web_search_wrong_agent'
        );
      }
      allowance = await readAllowance(context.userId);
    } catch (err) {
      logger.warn('Tutor web search: could not read the allowance', {
        error: err instanceof Error ? err.message : String(err),
      });
      return this.error(FAILED, 'web_search_failed');
    }
    if (allowance.remaining === 0) {
      return this.error(
        `No questions are left today for a search. ${allowanceSpentMessage(allowance.limit)} Answer from your own knowledge, saying so.`,
        'web_search_allowance_spent'
      );
    }

    const url = `${BRAVE_SEARCH_URL}?${new URLSearchParams({
      q: args.query,
      count: String(RESULTS),
      text_decorations: 'false',
    }).toString()}`;
    let body: unknown;
    try {
      const response = await executeHttpRequest({
        url,
        method: 'GET',
        headers: { Accept: 'application/json', 'X-Subscription-Token': key },
        timeoutMs: TIMEOUT_MS,
        maxResponseBytes: MAX_RESPONSE_BYTES,
        logContext: { capability: WEB_SEARCH_TOOL },
      });
      body = response.body;
    } catch (err) {
      const code = err instanceof HttpError ? err.code : 'unknown';
      // The status tells a bad key (401/403) from Brave being down (5xx). The message is logged, not passed on.
      logger.warn('Tutor web search failed', {
        code,
        status: err instanceof HttpError ? err.status : undefined,
        error: err instanceof Error ? err.message : String(err),
      });
      if (code === 'host_not_allowed') {
        return this.error(
          "Web search isn't set up on this app (its host is not allowed). Tell the learner, and answer from your own knowledge, saying so.",
          'web_search_not_configured'
        );
      }
      return this.error(FAILED, 'web_search_failed');
    }

    const results = trimBraveResults(body);
    if (!results) {
      logger.warn('Tutor web search: unexpected reply from Brave');
      return this.error(FAILED, 'web_search_failed');
    }
    return this.success(
      results.length
        ? { results }
        : {
            results,
            note: 'Nothing on the web matched. Answer from your own knowledge, saying so.',
          }
    );
  }
}
