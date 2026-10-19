import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { TutorExpectationSchema } from '@/lib/app/tutor/evals/graders';
import { hashParsedCases } from '@/lib/orchestration/evaluations/datasets/hash';
import type { ParsedDatasetCase } from '@/lib/orchestration/evaluations/datasets/parsers/types';
import { datasetCaseSchema } from '@/lib/orchestration/evaluations/datasets/upload-handler';
import type { SeedUnit } from '@/prisma/runner';

/**
 * The tutor's eval set (`f-tutor-knowledge` t-61), as a Sunrise dataset in the install org: the questions in
 * `./data/tutor-evals.json`, each case's expectation as its `expectedOutput`, which the `tutor_*` graders read
 * (`lib/app/tutor/evals/graders.ts`), and its kind as `metadata.category`.
 *
 * A pure code projection: the dataset is the file's. Each case is held to Sunrise's own case schema
 * (`datasetCaseSchema`, the one an upload passes), and the dataset's `contentHash` is Sunrise's hash of the same cases,
 * so a run pins it as it pins an uploaded one.
 *
 * - **Idempotent.** When the stored hash, name and description match, nothing is written.
 * - **Cases are rewritten in place**, by position, so a past run's results keep the case they scored. A shorter file
 *   deletes the cases past its end, which fails while a run's results still point at one (the foreign key): replace a
 *   case rather than remove it, or delete those runs first.
 */
const here = dirname(fileURLToPath(import.meta.url));
export const TUTOR_EVALS_FILE = join(here, 'data', 'tutor-evals.json');
/** A fixed id, so the seed finds its own dataset whatever an admin renames. */
export const TUTOR_EVALS_DATASET_ID = 'kys-tutor-evals';

const FileSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    cases: z
      .array(z.object({ input: z.string().min(1), expect: TutorExpectationSchema }).strict())
      .min(1),
  })
  .strict();

export interface TutorEvalSet {
  name: string;
  description: string;
  cases: ParsedDatasetCase[];
}

/** The file as Sunrise's dataset cases, each passed through `datasetCaseSchema`. Throws on a case either refuses. */
export function loadTutorEvals(file = TUTOR_EVALS_FILE): TutorEvalSet {
  const data = FileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  const cases = data.cases.map((c, i) => {
    const parsed = datasetCaseSchema.safeParse({
      input: c.input,
      expectedOutput: JSON.stringify(c.expect),
      metadata: { category: c.expect.kind },
    });
    if (!parsed.success) {
      throw new Error(
        `tutor-evals.json case ${i}: ${parsed.error.issues.map((x) => x.message).join('; ')}`
      );
    }
    return parsed.data;
  });
  return { name: data.name, description: data.description, cases };
}

const unit: SeedUnit = {
  name: 'app-knowyoursynth/004-tutor-evals',
  // The expectation schema the file is checked against lives with the graders.
  hashInputs: ['./data/tutor-evals.json', '../../../lib/app/tutor/evals/graders.ts'],
  async run({ prisma, logger }) {
    const set = loadTutorEvals();
    const contentHash = hashParsedCases(set.cases);
    const existing = await prisma.aiDataset.findUnique({
      where: { id: TUTOR_EVALS_DATASET_ID },
      select: { contentHash: true, name: true, description: true },
    });
    if (
      existing?.contentHash === contentHash &&
      existing.name === set.name &&
      existing.description === set.description
    ) {
      logger.info('Tutor eval set unchanged', { cases: set.cases.length });
      return;
    }

    const dataset = {
      name: set.name,
      description: set.description,
      tags: ['tutor'],
      caseCount: set.cases.length,
      contentHash,
      source: 'seed',
    };
    await prisma.$transaction(async (tx) => {
      await tx.aiDataset.upsert({
        where: { id: TUTOR_EVALS_DATASET_ID },
        update: dataset,
        create: { id: TUTOR_EVALS_DATASET_ID, ...dataset },
      });
      for (const [position, c] of set.cases.entries()) {
        const row = {
          input: c.input as Prisma.InputJsonValue,
          expectedOutput: c.expectedOutput ?? null,
          metadata:
            c.metadata !== undefined ? (c.metadata as Prisma.InputJsonValue) : Prisma.DbNull,
          referenceCitations: Prisma.DbNull,
        };
        await tx.aiDatasetCase.upsert({
          where: { datasetId_position: { datasetId: TUTOR_EVALS_DATASET_ID, position } },
          update: row,
          create: { datasetId: TUTOR_EVALS_DATASET_ID, position, ...row },
        });
      }
      await tx.aiDatasetCase.deleteMany({
        where: { datasetId: TUTOR_EVALS_DATASET_ID, position: { gte: set.cases.length } },
      });
    });
    logger.info(existing ? 'Tutor eval set updated' : 'Tutor eval set created', {
      cases: set.cases.length,
    });
  },
};

export default unit;
