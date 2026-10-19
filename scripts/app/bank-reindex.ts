import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { reconcileBankKnowledge } from '@/lib/app/bank/knowledge';
import { logger } from '@/lib/logging';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';
import { runAsOrg } from '@/lib/tenancy/context';

/**
 * `npm run bank:reindex [-- --force]`: project the databank into the install org's knowledge base now, rather than on
 * the next maintenance tick (`lib/app/bank/knowledge.ts`, `f-tutor-knowledge` t-58).
 *
 * Writes only the rows whose text changed. `--force` re-projects every row, which overwrites an admin's edit to one of
 * the documents and re-embeds after a change of embedding model (`npm run embeddings:reset` first). Costs one
 * embedding call per row written.
 */
async function main() {
  const force = process.argv.includes('--force');
  const result = await runAsOrg(INSTALL_ORG_ID, () => reconcileBankKnowledge({ force }));
  logger.info('Databank reindex', { force, ...result });
  if (result.status === 'done' && result.failed > 0) process.exit(1);
}

main().catch((err) => {
  logger.error('Databank reindex failed', err);
  process.exit(1);
});
