import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import '@/components/app/synth/synth.css';
import { SharedSettingsReadOnlyNotice } from '@/components/admin/shared-settings-access';
import { PATTERNS_ADMIN_ROOT } from '@/components/app/admin/patterns/paths';
import { PatternForm } from '@/components/app/admin/patterns/pattern-form';
import { ProvenancePanel } from '@/components/app/admin/patterns/provenance-panel';
import { Badge } from '@/components/ui/badge';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type {
  AdminLibraryRow,
  LibraryPatternChoices,
  PatternComment,
  PatternHistoryEntry,
} from '@/lib/app/patterns/library-edit';
import { logger } from '@/lib/logging';

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Edit pattern · Patterns',
  description: 'Edit a library pattern: its notes, role, provenance and tempo range.',
};

/**
 * Admin — one library pattern (`f-pattern-library` t-126). A thin server shell over
 * `GET /api/v1/admin/library-patterns/[id]` and `GET /api/v1/admin/library-patterns/choices`, as an API client reads
 * them. `'missing'` for a 404 (or an id that cannot be one), `null` when it could not be loaded. The sequencer's skin is
 * the synth page's, so its stylesheet comes too. Above the form, its provenance panel (t-156), with its comments and
 * history from `/comments` and `/history`, each `null` when it could not be read.
 */
async function getPattern(id: string): Promise<AdminLibraryRow | 'missing' | null> {
  try {
    const res = await serverFetch(`/api/v1/admin/library-patterns/${encodeURIComponent(id)}`);
    if (res.status === 404 || res.status === 400) return 'missing';
    if (!res.ok) return null;
    const body = await parseApiResponse<AdminLibraryRow>(res);
    return body.success ? body.data : null;
  } catch (err) {
    logger.error('pattern admin page: pattern fetch failed', err, { id });
    return null;
  }
}

/** One of the pattern's lists: its comments or its history. */
async function getList<T>(id: string, what: 'comments' | 'history'): Promise<T[] | null> {
  try {
    const res = await serverFetch(
      `/api/v1/admin/library-patterns/${encodeURIComponent(id)}/${what}`
    );
    if (!res.ok) return null;
    const body = await parseApiResponse<T[]>(res);
    return body.success && Array.isArray(body.data) ? body.data : null;
  } catch (err) {
    logger.error(`pattern admin page: ${what} fetch failed`, err, { id });
    return null;
  }
}

async function getChoices(): Promise<LibraryPatternChoices | null> {
  try {
    const res = await serverFetch('/api/v1/admin/library-patterns/choices');
    if (!res.ok) return null;
    const body = await parseApiResponse<LibraryPatternChoices>(res);
    return body.success ? body.data : null;
  } catch (err) {
    logger.error('pattern admin page: choices fetch failed', err);
    return null;
  }
}

export default async function PatternAdminPage({ params }: Props) {
  const { id } = await params;
  const [pattern, choices, comments, history] = await Promise.all([
    getPattern(id),
    getChoices(),
    getList<PatternComment>(id, 'comments'),
    getList<PatternHistoryEntry>(id, 'history'),
  ]);
  if (pattern === 'missing') notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href={PATTERNS_ADMIN_ROOT} className="text-muted-foreground text-sm hover:underline">
          ← Patterns
        </Link>
        {pattern && (
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {pattern.name}
            {'editedAt' in pattern && pattern.editedAt && <Badge variant="outline">Edited</Badge>}
            {'status' in pattern && pattern.status === 'disabled' && (
              <Badge variant="destructive">Disabled</Badge>
            )}
          </h1>
        )}
        {pattern && (
          <p className="text-muted-foreground text-xs">
            <code>{pattern.key}</code>
          </p>
        )}
      </header>

      <SharedSettingsReadOnlyNotice />

      {!pattern || !choices ? (
        <p role="alert" className="text-destructive text-sm">
          The pattern could not be loaded. Reload the page to try again.
        </p>
      ) : 'problem' in pattern ? (
        <p role="alert" className="text-destructive text-sm">
          {pattern.problem}. It cannot be edited here until it is fixed in the database.
        </p>
      ) : (
        <>
          <ProvenancePanel pattern={pattern} comments={comments} history={history} />
          <PatternForm pattern={pattern} choices={choices} />
        </>
      )}
    </div>
  );
}
