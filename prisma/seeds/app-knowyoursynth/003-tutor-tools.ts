import { readdirSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import type { Prisma } from '@prisma/client';
import { TUTOR_TOOLS } from '@/lib/app/tutor/tools';
import { reconcilePlatformAgents } from '@/lib/orchestration/agents/reconcile-platform-agents';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';
import type { SeedUnit } from '@/prisma/runner';

/**
 * The tutor's tools as capability rows, then the tutor bound to them (`f-tutor` t-53).
 *
 * Each row's `functionDefinition` is read from the tool's class, so what the model is shown and what runs cannot
 * disagree. The update branch re-applies the three code-owned fields and nothing an admin owns (the rule
 * `capability-code-owned-fields.test.ts` holds every capability seed to). Every tutor tool reads and proposes and never
 * writes, so each is idempotent.
 *
 * Then it reconciles the platform agents in the install org. Core's `021-platform-agents` runs before any app unit, so
 * on a fresh database the tutor is created there with no tools bound (a capability with no row is skipped with a
 * warning); this run binds them. The maintenance job would bind them within 15 minutes; this makes `db:seed` finish the
 * job. A failure is logged and does not fail the seed, as in 021: the org's marker is left behind, so the job retries.
 *
 * The hash takes in the tutor's folder, which holds the tool classes and the agent's definition, so a change to either
 * re-runs this unit on the next seed.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const tsIn = (folder: string) =>
  readdirSync(join(repo, folder), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .sort()
    .map((f) => relative(here, join(repo, folder, f)));

/** The admin-facing columns, written when a row is created and the admin's after that. */
export const TUTOR_TOOL_ROWS: Record<
  string,
  { name: string; description: string; executionHandler: string; rateLimit: number }
> = {
  get_panel: {
    name: 'Tutor: read the panel',
    description:
      'Reads the synth panel the learner has open, as the tutor route passed it. Read-only.',
    executionHandler: 'GetPanelCapability',
    rateLimit: 60,
  },
  describe_synth: {
    name: 'Tutor: look up the synth',
    description:
      "Looks up a synth's controls, jacks and legal values from its definition, whole or by section. Read-only.",
    executionHandler: 'DescribeSynthCapability',
    rateLimit: 60,
  },
  propose_panel_change: {
    name: 'Tutor: propose a panel change',
    description:
      'Proposes controls to set and cables to add or remove, checked against the synth. The learner applies it; the tool changes nothing.',
    executionHandler: 'ProposePanelChangeCapability',
    rateLimit: 30,
  },
  design_sound: {
    name: 'Tutor: design a sound',
    description:
      'Designs a whole sound with its lesson, checked against the synth. The learner keeps it or not; the tool changes nothing.',
    executionHandler: 'DesignSoundCapability',
    rateLimit: 30,
  },
};

const unit: SeedUnit = {
  name: 'app-knowyoursynth/003-tutor-tools',
  hashInputs: [...tsIn('lib/app/tutor')],
  async run({ prisma, logger }) {
    for (const tool of TUTOR_TOOLS) {
      const row = TUTOR_TOOL_ROWS[tool.slug];
      if (!row) throw new Error(`003-tutor-tools: no row for the tutor tool ${tool.slug}`);
      // Written out as `functionDefinition: definition`, not shorthand: the code-owned-fields guard reads `key:` entries.
      const definition = tool.functionDefinition as unknown as Prisma.InputJsonValue;
      await prisma.aiCapability.upsert({
        where: { slug: tool.slug },
        update: {
          isSystem: true,
          functionDefinition: definition,
          executionType: 'internal',
          executionHandler: row.executionHandler,
        },
        create: {
          slug: tool.slug,
          name: row.name,
          description: row.description,
          category: 'tutor',
          rateLimit: row.rateLimit,
          isIdempotent: true,
          isActive: true,
          isSystem: true,
          functionDefinition: definition,
          executionType: 'internal',
          executionHandler: row.executionHandler,
        },
      });
    }
    logger.info(`Seeded ${TUTOR_TOOLS.length} tutor tools`);

    try {
      const result = await reconcilePlatformAgents(INSTALL_ORG_ID, { db: prisma, log: logger });
      logger.info('Platform agents reconciled in the install org', {
        created: result.created,
        updated: result.updated,
        missing: result.missing,
      });
    } catch (err) {
      logger.error('Platform agents not reconciled; the maintenance job retries', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

export default unit;
