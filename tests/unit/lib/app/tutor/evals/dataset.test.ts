/**
 * The tutor's eval set (`f-tutor-knowledge` t-61) and the seed that writes it,
 * `prisma/seeds/app-knowyoursynth/004-tutor-evals.ts`.
 *
 * The file is checked against the databank it asks about: every row a case expects exists, a databank case's row is
 * one the lexical search ranks in the tool's six for the question, and a meaning case's is not, so only the
 * meaning-based layer can find it. The seed runs against a small stateful fake, so a second run is shown to write
 * nothing.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { bankHref } from '@/components/app/bank/routes';
import { documentsOf, searchBankIn } from '@/lib/app/bank/search';
import { TutorExpectationSchema } from '@/lib/app/tutor/evals/graders';
import { hashParsedCases } from '@/lib/orchestration/evaluations/datasets/hash';
import { datasetCaseSchema } from '@/lib/orchestration/evaluations/datasets/upload-handler';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';
import seed, {
  TUTOR_EVALS_DATASET_ID,
  loadTutorEvals,
} from '@/prisma/seeds/app-knowyoursynth/004-tutor-evals';
import type { SeedContext } from '@/prisma/runner';

/** What `search_databank` returns of a layer's ranking (`RESULTS` in `search-databank.ts`). */
const TOOL_RESULTS = 6;

const set = loadTutorEvals();
const cases = set.cases.map((c) => ({
  input: typeof c.input === 'string' ? c.input : JSON.stringify(c.input),
  expect: TutorExpectationSchema.parse(JSON.parse(c.expectedOutput ?? '')),
}));
const bank = loadBankData();

describe('the eval set', () => {
  it('has 30 to 50 cases, each one Sunrise’s case schema takes', () => {
    expect(set.cases.length).toBeGreaterThanOrEqual(30);
    expect(set.cases.length).toBeLessThanOrEqual(50);
    for (const c of set.cases) expect(datasetCaseSchema.safeParse(c).success).toBe(true);
  });

  it('covers each kind of question, at least five of each', () => {
    const counts = new Map<string, number>();
    for (const c of cases) counts.set(c.expect.kind, (counts.get(c.expect.kind) ?? 0) + 1);
    for (const kind of ['databank', 'meaning', 'web', 'general', 'off_topic']) {
      expect(counts.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(5);
    }
  });

  it('asks each question once', () => {
    expect(new Set(cases.map((c) => c.input)).size).toBe(cases.length);
  });

  it('expects only rows the databank has', () => {
    const pages = new Set(documentsOf(bank).map((d) => bankHref(d.ref.kind, d.ref.id)));
    const rows = cases.flatMap((c) => ('rows' in c.expect ? c.expect.rows : []));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => !pages.has(r))).toEqual([]);
  });

  it.each(cases.filter((c) => c.expect.kind === 'databank').map((c) => [c.input, c.expect]))(
    'databank: "%s" finds one of its rows by name',
    (question, expectation) => {
      const top = searchBankIn(bank, question, { limit: TOOL_RESULTS }).map((h) => h.href);
      const rows = 'rows' in expectation ? expectation.rows : [];
      expect(
        rows.some((r) => top.includes(r)),
        `top: ${top.join(', ')}`
      ).toBe(true);
    }
  );

  it.each(cases.filter((c) => c.expect.kind === 'meaning').map((c) => [c.input, c.expect]))(
    'meaning: "%s" finds none of its rows by name alone',
    (question, expectation) => {
      const top = searchBankIn(bank, question, { limit: TOOL_RESULTS }).map((h) => h.href);
      const rows = 'rows' in expectation ? expectation.rows : [];
      expect(rows.filter((r) => top.includes(r))).toEqual([]);
    }
  );
});

interface StoredCase {
  datasetId: string;
  position: number;
  [key: string]: unknown;
}

/** Just enough of the client for the seed: one dataset table and its cases, in memory. */
function fakeDb() {
  const datasets = new Map<string, Record<string, unknown>>();
  const stored = new Map<number, StoredCase>();
  const writes: string[] = [];
  const db = {
    aiDataset: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(datasets.get(where.id) ?? null)
      ),
      upsert: vi.fn(
        (a: {
          where: { id: string };
          update: Record<string, unknown>;
          create: Record<string, unknown>;
        }) => {
          writes.push('dataset');
          const prev = datasets.get(a.where.id);
          datasets.set(a.where.id, prev ? { ...prev, ...a.update } : a.create);
          return Promise.resolve({});
        }
      ),
    },
    aiDatasetCase: {
      upsert: vi.fn(
        (a: {
          where: { datasetId_position: { position: number } };
          update: Record<string, unknown>;
          create: StoredCase;
        }) => {
          writes.push('case');
          const pos = a.where.datasetId_position.position;
          const prev = stored.get(pos);
          stored.set(pos, prev ? { ...prev, ...a.update } : a.create);
          return Promise.resolve({});
        }
      ),
      deleteMany: vi.fn((a: { where: { position: { gte: number } } }) => {
        writes.push('delete');
        for (const pos of [...stored.keys()]) if (pos >= a.where.position.gte) stored.delete(pos);
        return Promise.resolve({ count: 0 });
      }),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const ctx = { prisma: db, logger } as unknown as SeedContext;
  return { ctx, datasets, stored, writes };
}

describe('004-tutor-evals', () => {
  it('writes the dataset and one case per question, pinned to Sunrise’s hash of them', async () => {
    const { ctx, datasets, stored } = fakeDb();
    await seed.run(ctx);
    expect(datasets.get(TUTOR_EVALS_DATASET_ID)).toMatchObject({
      id: TUTOR_EVALS_DATASET_ID,
      name: set.name,
      caseCount: set.cases.length,
      contentHash: hashParsedCases(set.cases),
    });
    expect(stored.size).toBe(set.cases.length);
    expect(stored.get(0)).toMatchObject({
      position: 0,
      input: set.cases[0]?.input,
      expectedOutput: set.cases[0]?.expectedOutput,
      metadata: { category: cases[0]?.expect.kind },
    });
  });

  it('writes nothing on a second run', async () => {
    const { ctx, writes } = fakeDb();
    await seed.run(ctx);
    writes.length = 0;
    await seed.run(ctx);
    expect(writes).toEqual([]);
  });

  it('rewrites cases in place when the file changed, and drops the ones past its end', async () => {
    const { ctx, datasets, stored } = fakeDb();
    datasets.set(TUTOR_EVALS_DATASET_ID, { contentHash: 'older', name: 'old', description: 'old' });
    const extra = set.cases.length + 2;
    for (let pos = 0; pos <= extra; pos++) {
      stored.set(pos, { datasetId: TUTOR_EVALS_DATASET_ID, position: pos, input: 'old' });
    }
    await seed.run(ctx);
    expect(stored.size).toBe(set.cases.length);
    expect(stored.get(0)?.input).toBe(set.cases[0]?.input);
    expect(datasets.get(TUTOR_EVALS_DATASET_ID)?.contentHash).toBe(hashParsedCases(set.cases));
  });

  it('rewrites a dataset an admin renamed, though its cases are unchanged', async () => {
    const { ctx, datasets, writes } = fakeDb();
    await seed.run(ctx);
    datasets.set(TUTOR_EVALS_DATASET_ID, {
      ...datasets.get(TUTOR_EVALS_DATASET_ID),
      name: 'Renamed by an admin',
    });
    writes.length = 0;
    await seed.run(ctx);
    expect(writes).toContain('dataset');
    expect(datasets.get(TUTOR_EVALS_DATASET_ID)?.name).toBe(set.name);
  });
});

describe('loadTutorEvals', () => {
  const fileWith = (data: unknown) => {
    const file = join(mkdtempSync(join(tmpdir(), 'tutor-evals-')), 'tutor-evals.json');
    writeFileSync(file, JSON.stringify(data));
    return file;
  };

  it('refuses a case Sunrise’s case schema would refuse, naming it', () => {
    const file = fileWith({
      name: 'n',
      description: 'd',
      cases: [{ input: 'x'.repeat(50_001), expect: { kind: 'general' } }],
    });
    expect(() => loadTutorEvals(file)).toThrow(/case 0/);
  });

  it('refuses an expectation the graders could not read', () => {
    const file = fileWith({
      name: 'n',
      description: 'd',
      cases: [{ input: 'q', expect: { kind: 'databank', rows: ['not a page'] } }],
    });
    expect(() => loadTutorEvals(file)).toThrow();
  });
});
