/**
 * The databank in the knowledge base (`f-tutor-knowledge` t-58): the meaning-based layer under `search_databank`.
 *
 * The lexical search (`lib/app/bank/search.ts`) finds rows by the words in them. It misses a question that names
 * nothing in the bank ("who pioneered modular synthesis?"). So each row is projected into one knowledge document, in the
 * install org's default knowledge base, tagged `kys-databank`, and searched by meaning through Sunrise's vector search.
 *
 * A pure code projection (`fp4`), written only through the document manager:
 *  - **idempotent**: a row's document is keyed on its content hash (the document's `fileHash`), and a row whose text
 *    has not changed is not written;
 *  - **partitioned**: only documents carrying the tag are ever removed;
 *  - **safe on empty**: a bank read with no rows deletes nothing and logs a warning;
 *  - **authoritative**: an admin's edit to one of these documents is overwritten when the row next changes, or at once
 *    by `npm run bank:reindex -- --force`.
 *
 * A row's document holds the names of the rows it links to, so a rename changes, and re-projects, every row that names it.
 *
 * Runs from `npm run bank:reindex` and on the maintenance tick (`lib/app/jobs.ts`), never on an admin's save: an embedding
 * call per row would make a save wait on a provider. With no usable embedding provider it skips and logs, since every
 * upload would fail.
 */
import { createHash } from 'crypto';
import { prisma } from '@/lib/db/client';
import { serviceAccountWhere } from '@/lib/auth/account';
import { logger } from '@/lib/logging';
import type { Bank } from '@/lib/app/bank/data';
import { BANK_KINDS, loadBank, type BankKind } from '@/lib/app/bank/read';
import { documentsOf, type BankDoc, type BankRef } from '@/lib/app/bank/search';
import { deleteDocument, uploadDocument } from '@/lib/orchestration/knowledge/document-manager';
import { resolveEmbeddingAvailability } from '@/lib/orchestration/knowledge/embedder';
import { searchKnowledgeWithEmbedding } from '@/lib/orchestration/knowledge/search';

/** The tag every projected document carries, and the only documents the reconcile removes. */
export const DATABANK_TAG_SLUG = 'kys-databank';
const FILE_PREFIX = 'kys-databank-';
/** Uploads in flight at once: each is one embedding call, so a first run of the whole bank is not 1,400 in a row. */
const CONCURRENCY = 4;

const KIND_LABEL: Record<BankKind, string> = {
  artists: 'Artist',
  makers: 'Innovator',
  instruments: 'Instrument',
  songs: 'Record',
};

/** One row's document, as the reconcile writes it. */
export interface BankProjection {
  ref: BankRef;
  fileName: string;
  name: string;
  content: string;
  /** SHA-256 of `content`: what the document manager stores as `fileHash`. */
  hash: string;
}

const keyOf = (ref: { kind: string; id: string }): string => `${ref.kind}/${ref.id}`;

/** A row's document's file name. The kind has no hyphen, so the first one after the prefix ends it. */
export const fileNameOf = (ref: BankRef): string => `${FILE_PREFIX}${ref.kind}-${ref.id}.md`;

/** The row a projected document's file name names, or null for any other file. */
export function refOfFileName(fileName: string): { kind: BankKind; id: string } | null {
  const m = /^kys-databank-([a-z]+)-(.+)\.md$/.exec(fileName);
  const kind = m && BANK_KINDS.find((k) => k === m[1]);
  return m && kind ? { kind, id: m[2] } : null;
}

/** A row's document: its name, what it is, its text, and the names of the rows it links to. */
function contentOf(d: BankDoc): string {
  const lines = [
    `## ${d.ref.name}`,
    '',
    [KIND_LABEL[d.ref.kind], d.about].filter(Boolean).join(': '),
  ];
  if (d.body) lines.push('', d.body);
  if (d.related.length) lines.push('', `Linked: ${d.related.map((r) => r.name).join(', ')}.`);
  return `${lines.join('\n')}\n`;
}

/** Every row of `bank` as its document. Pure. */
export function projectBank(bank: Bank): BankProjection[] {
  return documentsOf(bank).map((d) => {
    const content = contentOf(d);
    return {
      ref: d.ref,
      fileName: fileNameOf(d.ref),
      name: `Databank: ${d.ref.name}`,
      content,
      hash: createHash('sha256').update(content).digest('hex'),
    };
  });
}

export type ReconcileResult =
  | { status: 'skipped'; reason: string }
  | { status: 'done'; written: number; unchanged: number; deleted: number; failed: number };

interface Held {
  id: string;
  fileName: string;
  fileHash: string;
  status: string;
}

/** Run `fn` over `items`, at most `limit` at once. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Bring the knowledge base's databank documents in line with the bank. Call inside the install org's tenant context.
 * `force` re-projects every row, which is what overwrites an admin's edit to a row that has not changed.
 */
export async function reconcileBankKnowledge(
  options: { force?: boolean } = {}
): Promise<ReconcileResult> {
  const availability = await resolveEmbeddingAvailability();
  if (availability !== 'ok') {
    logger.info('Databank knowledge: skipped, no usable embedding provider', { availability });
    return { status: 'skipped', reason: `embedding provider: ${availability}` };
  }

  const projections = projectBank(await loadBank());
  if (!projections.length) {
    logger.warn('Databank knowledge: the bank read no rows, so nothing is projected or deleted');
    return { status: 'skipped', reason: 'empty bank' };
  }

  const owner =
    (await prisma.user.findFirst({ where: serviceAccountWhere, select: { id: true } })) ??
    (await prisma.user.findFirst({ select: { id: true } }));
  if (!owner) {
    logger.warn('Databank knowledge: no user to own the documents');
    return { status: 'skipped', reason: 'no user' };
  }

  const tag = await prisma.knowledgeTag.upsert({
    where: { slug: DATABANK_TAG_SLUG },
    create: {
      slug: DATABANK_TAG_SLUG,
      name: 'Databank',
      description:
        "Know Your Synth's databank, one document per row, written by the app (`npm run bank:reindex`). Edits here are overwritten.",
    },
    update: {},
  });

  const held: Held[] = await prisma.aiKnowledgeDocument.findMany({
    where: { tags: { some: { tagId: tag.id } } },
    select: { id: true, fileName: true, fileHash: true, status: true },
  });
  const heldByKey = new Map<string, Held[]>();
  for (const doc of held) {
    const ref = refOfFileName(doc.fileName);
    const key = ref ? keyOf(ref) : `?/${doc.id}`;
    heldByKey.set(key, [...(heldByKey.get(key) ?? []), doc]);
  }

  const result = { written: 0, unchanged: 0, deleted: 0, failed: 0 };
  // Never throws: a delete that fails (the document already gone) is logged and left for the next run, so it cannot
  // reject the pool mid-flight and skip the rest of the reconcile.
  const remove = async (docs: Held[]): Promise<void> => {
    for (const doc of docs) {
      try {
        await deleteDocument(doc.id);
        result.deleted++;
      } catch (err) {
        logger.warn('Databank knowledge: a document could not be deleted', {
          documentId: doc.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  await pool(projections, CONCURRENCY, async (p) => {
    const docs = heldByKey.get(keyOf(p.ref)) ?? [];
    heldByKey.delete(keyOf(p.ref));
    const current = options.force
      ? undefined
      : docs.find((d) => d.status === 'ready' && d.fileHash === p.hash);
    if (current) {
      result.unchanged++;
      await remove(docs.filter((d) => d !== current));
      return;
    }
    try {
      // Forced, the old copy goes first: the document manager would hand it back as a duplicate of the same text.
      if (options.force) await remove(docs.splice(0));
      const doc = await uploadDocument(p.content, p.fileName, owner.id, undefined, p.name);
      if (doc.fileName !== p.fileName) {
        // The same text is already an untagged document someone else uploaded: leave it theirs.
        logger.warn('Databank knowledge: a row matches an untagged document, left alone', {
          row: keyOf(p.ref),
          documentId: doc.id,
        });
        result.failed++;
        return;
      }
      await prisma.aiKnowledgeDocumentTag.upsert({
        where: { documentId_tagId: { documentId: doc.id, tagId: tag.id } },
        create: { documentId: doc.id, tagId: tag.id },
        update: {},
      });
      result.written++;
      await remove(docs.filter((d) => d.id !== doc.id));
    } catch (err) {
      // The old copy stays searchable, unless forced (deleted above). A failed upload is left untagged; clear it, or its slug would hand the failed
      // row back to the next run as this content's document.
      result.failed++;
      logger.error('Databank knowledge: a row failed to project', err, { row: keyOf(p.ref) });
      await prisma.aiKnowledgeDocument
        .deleteMany({
          where: { fileName: p.fileName, fileHash: p.hash, status: 'failed', tags: { none: {} } },
        })
        .catch((cleanupErr: unknown) =>
          logger.warn('Databank knowledge: a failed upload could not be cleared', {
            row: keyOf(p.ref),
            error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          })
        );
    }
  });

  // What is left held names a row the bank no longer has.
  for (const docs of heldByKey.values()) await remove(docs);

  logger.info('Databank knowledge: reconciled', { rows: projections.length, ...result });
  return { status: 'done', ...result };
}

/** A row the meaning-based layer found, best first. */
export interface MeaningHit {
  ref: { kind: BankKind; id: string };
  similarity: number;
}

export type MeaningSearch =
  { status: 'ok'; hits: MeaningHit[] } | { status: 'unavailable'; reason: string };

/**
 * Search the projected documents by meaning: Sunrise's vector search, restricted to the tagged documents' ids, one
 * result per row. Never throws: with no projection, no provider, or a stored vector of another dimension (checked before
 * the query is embedded, by the search itself), it says the layer is unavailable and why.
 */
export async function searchBankByMeaning(
  query: string,
  options: { kind?: BankKind; limit: number }
): Promise<MeaningSearch> {
  try {
    const docs = await prisma.aiKnowledgeDocument.findMany({
      where: { status: 'ready', tags: { some: { tag: { slug: DATABANK_TAG_SLUG } } } },
      select: { id: true, fileName: true },
    });
    const refs = new Map<string, { kind: BankKind; id: string }>();
    for (const d of docs) {
      const ref = refOfFileName(d.fileName);
      if (ref && (!options.kind || ref.kind === options.kind)) refs.set(d.id, ref);
    }
    if (!refs.size) return { status: 'unavailable', reason: 'the databank is not projected' };

    // A row is usually one chunk; ask for a few more so a long row's second chunk does not crowd out another row.
    const { results } = await searchKnowledgeWithEmbedding(
      query,
      { documentIds: [...refs.keys()] },
      options.limit * 2
    );
    const seen = new Set<string>();
    const hits: MeaningHit[] = [];
    for (const r of results) {
      const ref = refs.get(r.chunk.documentId);
      if (!ref || seen.has(keyOf(ref))) continue;
      seen.add(keyOf(ref));
      hits.push({ ref, similarity: r.similarity });
      if (hits.length === options.limit) break;
    }
    return { status: 'ok', hits };
  } catch (err) {
    logger.warn('Databank meaning search unavailable', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: 'unavailable', reason: 'the meaning search failed' };
  }
}
