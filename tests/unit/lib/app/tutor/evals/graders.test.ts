/**
 * The tutor's eval graders (`f-tutor-knowledge` t-61). Each grader passes a hand-made passing case, fails a hand-made
 * failing one, and scores null on a case it does not cover, so the run's stats leave that case out.
 *
 * The search previews are the tools' own (`redactProvenance` on real results), so a change to the preview's shape
 * fails here rather than in a run.
 *
 * @see lib/app/tutor/evals/graders.ts
 */
import { describe, it, expect } from 'vitest';
import {
  DECLINE_MAX_CHARS,
  TUTOR_GRADERS,
  gradeDatabankFound,
  gradeDeclinedOffTopic,
  gradeOwnKnowledgeLabelled,
  gradeWebLinks,
  type TutorExpectation,
} from '@/lib/app/tutor/evals/graders';
import { SearchDatabankCapability } from '@/lib/app/tutor/search-databank';
import { WebSearchCapability } from '@/lib/app/tutor/web-search';
import type { GraderInput } from '@/lib/orchestration/evaluations/graders/types';

type ToolCall = NonNullable<GraderInput['toolCalls']>[number];

const ORAM = '/bank/makers/daphne-oram';

function databankCall(hrefs: string[]): ToolCall {
  const args = { query: 'q' };
  const results = hrefs.map((href) => {
    const [, , kind, id] = href.split('/');
    return { kind, id, name: id, line: '', excerpt: '', href, links: [], matchedBy: ['lexical'] };
  });
  const result = { success: true, data: { results, search: 'lexical' } };
  const { resultPreview } = new SearchDatabankCapability().redactProvenance(args, result as never);
  return { slug: 'search_databank', args, success: true, resultPreview };
}

function webCall(urls: string[]): ToolCall {
  const args = { query: 'q' };
  const results = urls.map((url) => ({ title: 'A page', url, snippet: '' }));
  const result = { success: true, data: { results } };
  const { resultPreview } = new WebSearchCapability().redactProvenance(args, result);
  return { slug: 'web_search', args, success: true, resultPreview };
}

function refused(slug: string, errorCode: string): ToolCall {
  return { slug, args: { query: 'q' }, success: false, errorCode };
}

function input(
  expect: TutorExpectation | null,
  modelOutput: string,
  toolCalls: ToolCall[] = []
): GraderInput {
  return {
    userInput: 'A question',
    modelOutput,
    ...(expect ? { expectedOutput: JSON.stringify(expect) } : {}),
    toolCalls,
    config: {},
  };
}

const databank: TutorExpectation = { kind: 'databank', rows: [ORAM] };

describe('the previews the graders read', () => {
  it('a search_databank preview lists the hrefs the panel would link', () => {
    expect(JSON.parse(databankCall([ORAM]).resultPreview ?? '')).toEqual({
      success: true,
      links: [ORAM],
    });
  });

  it('a web_search preview lists the URLs, and drops one the panel would not link', () => {
    const call = webCall(['https://example.com/a', 'javascript:alert(1)']);
    expect(JSON.parse(call.resultPreview ?? '')).toEqual({
      success: true,
      links: ['https://example.com/a'],
    });
  });

  it('a refusal keeps the default preview, with its error', () => {
    const result = { success: false, error: { code: 'web_search_not_configured', message: 'm' } };
    const { resultPreview } = new WebSearchCapability().redactProvenance({ query: 'q' }, result);
    expect(resultPreview).toContain('web_search_not_configured');
  });
});

describe('tutor_databank_found', () => {
  it('passes when a search found one of the rows', () => {
    const r = gradeDatabankFound(input(databank, 'Daphne Oram…', [databankCall([ORAM])]));
    expect(r).toMatchObject({ score: 1, passed: true });
  });

  it('fails when the search found other rows, naming them', () => {
    const r = gradeDatabankFound(
      input(databank, '…', [databankCall(['/bank/makers/robert-moog'])])
    );
    expect(r).toMatchObject({ score: 0, passed: false });
    expect(r.reasoning).toContain('/bank/makers/robert-moog');
  });

  it('fails when the tutor answered without searching', () => {
    expect(gradeDatabankFound(input(databank, 'From memory…'))).toMatchObject({ passed: false });
  });

  it('does not trust a refused call, whatever its preview says', () => {
    const call = { ...databankCall([ORAM]), success: false };
    expect(gradeDatabankFound(input(databank, '…', [call]))).toMatchObject({ passed: false });
  });

  it('scores null on a case that is not a databank case, or has no expectation', () => {
    for (const exp of [{ kind: 'general' } as const, null]) {
      const r = gradeDatabankFound(input(exp, '…', [databankCall([ORAM])]));
      expect(r.score).toBeNull();
      expect(r.passed).toBeUndefined();
    }
  });
});

describe('tutor_web_links', () => {
  const web: TutorExpectation = { kind: 'web' };

  it('passes when web_search returned a link', () => {
    const r = gradeWebLinks(input(web, '…', [webCall(['https://example.com/a'])]));
    expect(r).toMatchObject({ score: 1, passed: true });
  });

  it('fails when web_search ran and returned no links', () => {
    expect(gradeWebLinks(input(web, '…', [webCall([])]))).toMatchObject({ passed: false });
  });

  it('fails a web case the tutor did not search the web for', () => {
    expect(gradeWebLinks(input(web, '…', [databankCall([])]))).toMatchObject({ passed: false });
  });

  it('checks any case where web_search ran, not only web cases', () => {
    expect(gradeWebLinks(input(databank, '…', [webCall([])]))).toMatchObject({ passed: false });
  });

  it('scores null when every web_search refused: the environment, not the tutor', () => {
    const r = gradeWebLinks(input(web, '…', [refused('web_search', 'web_search_not_configured')]));
    expect(r.score).toBeNull();
    expect(r.reasoning).toContain('web_search_not_configured');
  });

  it('scores null on a case that did not search the web and needs no web', () => {
    expect(gradeWebLinks(input({ kind: 'general' }, '…')).score).toBeNull();
  });
});

describe('tutor_declined_off_topic', () => {
  const offTopic: TutorExpectation = { kind: 'off_topic' };

  it.each([
    "That's outside what I do: I can help with music, sound and synthesisers.",
    'Sorry, that isn’t something I can help with. Ask me about synths!',
    "I'm here to help with music and synthesisers, so I'll leave that one.",
  ])('passes a brief decline: %s', (answer) => {
    expect(gradeDeclinedOffTopic(input(offTopic, answer))).toMatchObject({
      score: 1,
      passed: true,
    });
  });

  it('fails an answer to the question', () => {
    const r = gradeDeclinedOffTopic(input(offTopic, 'The capital of Australia is Canberra.'));
    expect(r).toMatchObject({ score: 0, passed: false });
  });

  it('fails a decline that goes on to answer anyway', () => {
    const answer = `That's outside what I do, but here goes. ${'Canberra was chosen as a compromise. '.repeat(20)}`;
    expect(answer.length).toBeGreaterThan(DECLINE_MAX_CHARS);
    expect(gradeDeclinedOffTopic(input(offTopic, answer))).toMatchObject({ passed: false });
  });

  it('fails a decline that searched first', () => {
    const r = gradeDeclinedOffTopic(
      input(offTopic, "That's outside what I do.", [refused('web_search', 'x')])
    );
    expect(r).toMatchObject({ passed: false });
  });

  it('scores null on a case that is not off-topic', () => {
    expect(gradeDeclinedOffTopic(input(databank, "That's outside what I do.")).score).toBeNull();
  });
});

describe('tutor_own_knowledge', () => {
  it('passes an unsourced answer that says it is from its own knowledge', () => {
    const r = gradeOwnKnowledgeLabelled(
      input({ kind: 'web' }, 'Search isn’t set up, so this is from my own knowledge: …', [
        refused('web_search', 'web_search_not_configured'),
      ])
    );
    expect(r).toMatchObject({ score: 1, passed: true });
  });

  it('fails a search that found nothing, answered as if it had', () => {
    const r = gradeOwnKnowledgeLabelled(
      input(databank, 'Daphne Oram co-founded the Radiophonic Workshop.', [databankCall([])])
    );
    expect(r).toMatchObject({ score: 0, passed: false });
  });

  it('fails a databank question answered without searching and without the label', () => {
    expect(gradeOwnKnowledgeLabelled(input(databank, 'Daphne Oram…'))).toMatchObject({
      passed: false,
    });
  });

  it('scores null on a sourced turn', () => {
    expect(
      gradeOwnKnowledgeLabelled(input(databank, '…', [databankCall([ORAM])])).score
    ).toBeNull();
  });

  it('scores null on a general question answered without searching', () => {
    expect(
      gradeOwnKnowledgeLabelled(input({ kind: 'general' }, 'A low-pass filter…')).score
    ).toBeNull();
  });
});

describe('TUTOR_GRADERS', () => {
  it('registers the four as heuristic graders that need no reference', async () => {
    expect(TUTOR_GRADERS.map((g) => g.slug)).toEqual([
      'tutor_databank_found',
      'tutor_web_links',
      'tutor_declined_off_topic',
      'tutor_own_knowledge',
    ]);
    for (const g of TUTOR_GRADERS) {
      expect(g).toMatchObject({ family: 'heuristic', referenceRequired: false });
      expect(g.configSchema.safeParse(g.defaultConfig).success).toBe(true);
    }
    // The entry delegates to its grade function.
    const entry = TUTOR_GRADERS[0];
    await expect(
      entry.grade({ ...input(databank, '…', [databankCall([ORAM])]), config: {} })
    ).resolves.toMatchObject({ passed: true });
  });
});
