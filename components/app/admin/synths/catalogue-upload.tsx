'use client';

/**
 * CatalogueUpload — upload one synth's content as JSON (`f-catalogue-admin`, t-33).
 *
 * Posts the file to `POST /api/v1/admin/synths/:id/content` exactly as it is, so the file the server keeps is the admin's.
 * Only its size is checked here; every real check, JSON included, is the server's. A refusal lists each problem the server named, and nothing was written.
 * An accepted upload shows what it did per table and refreshes the page, so the comparison below reflects it.
 */

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { Label } from '@/components/ui/label';
import { apiClient, APIClientError } from '@/lib/api/client';
import type { SeedCounts } from '@/lib/app/catalogue/seed';
import { MAX_CONTENT_BYTES } from '@/lib/app/catalogue/data';
import type { UploadProblem, UploadReport } from '@/lib/app/catalogue/upload';

const MAX_MB = `${MAX_CONTENT_BYTES / (1024 * 1024)} MB`;

const TABLES: { key: keyof UploadReport; label: string }[] = [
  { key: 'sounds', label: 'Sounds' },
  { key: 'lineage', label: 'History' },
  { key: 'notes', label: 'Notes' },
];

const COLUMNS: { key: keyof SeedCounts; label: string }[] = [
  { key: 'created', label: 'Created' },
  { key: 'updated', label: 'Updated' },
  { key: 'unchanged', label: 'Unchanged' },
  { key: 'edited', label: 'Skipped as edited' },
];

type Outcome =
  | { kind: 'done'; synth: string; report: UploadReport }
  | { kind: 'refused'; message: string; problems: UploadProblem[] };

function problemsOf(details: Record<string, unknown> | undefined): UploadProblem[] {
  const errors = details?.errors;
  if (!Array.isArray(errors)) return [];
  return errors.flatMap((e: unknown) =>
    e !== null &&
    typeof e === 'object' &&
    'message' in e &&
    typeof e.message === 'string' &&
    'path' in e &&
    typeof e.path === 'string'
      ? [{ path: e.path, message: e.message }]
      : []
  );
}

export interface CatalogueUploadProps {
  /** The synths an upload may be for: those in the catalogue. */
  synths: { id: string; name: string }[];
}

export function CatalogueUpload({ synths }: CatalogueUploadProps) {
  const router = useRouter();
  const [synthId, setSynthId] = useState(synths[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const refuse = (message: string, problems: UploadProblem[] = []) =>
    setOutcome({ kind: 'refused', message, problems });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !synthId) return;
    setOutcome(null);
    // The server's limit, checked here too so a large file is refused before it is sent.
    if (file.size > MAX_CONTENT_BYTES) return refuse(`The file is larger than ${MAX_MB}.`);
    setBusy(true);
    try {
      // Sent as raw text rather than as `body`, which `apiClient` would serialise again.
      const { report } = await apiClient.post<{ report: UploadReport }>(
        `/api/v1/admin/synths/${encodeURIComponent(synthId)}/content`,
        { options: { body: await file.text() } }
      );
      setOutcome({
        kind: 'done',
        synth: synths.find((s) => s.id === synthId)?.name ?? synthId,
        report,
      });
      router.refresh();
    } catch (err) {
      if (err instanceof APIClientError) refuse(err.message, problemsOf(err.details));
      else refuse('The upload failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">
        Upload content{' '}
        <FieldHelp title="Uploading a synth's content">
          <p>
            Upload one synth&apos;s content in the template&apos;s shape. It is checked the way the
            seed checks it, and if anything in it is wrong, nothing is written and every problem is
            listed.
          </p>
          <p className="mt-2">
            New rows are added and rows nobody has edited are updated. A row an admin has edited is
            skipped, and nothing is deleted. What the upload writes counts as an admin edit, so the
            seed leaves it alone afterwards.
          </p>
          <p className="mt-2">
            Uploads only add to synths the app already has. Adding a synth is developer work.
          </p>
        </FieldHelp>
      </h2>
      {synths.length === 0 ? (
        <p className="text-muted-foreground text-sm">The catalogue has no synths yet.</p>
      ) : (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => void submit(e)}>
          <div className="space-y-1">
            <Label htmlFor="catalogue-upload-synth">Synth</Label>
            <select
              id="catalogue-upload-synth"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              value={synthId}
              onChange={(e) => setSynthId(e.target.value)}
            >
              {synths.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="catalogue-upload-file">Content file (JSON, up to {MAX_MB})</Label>
            <input
              id="catalogue-upload-file"
              type="file"
              accept=".json,application/json"
              className="block text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button type="submit" size="sm" disabled={busy || !file}>
            <Upload className="mr-1.5 h-4 w-4" aria-hidden />
            {busy ? 'Uploading…' : 'Upload'}
          </Button>
        </form>
      )}

      {outcome?.kind === 'refused' && (
        <div role="alert" className="text-destructive space-y-1 text-sm">
          <p>{outcome.message}</p>
          {outcome.problems.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs">
              {outcome.problems.map((p, i) => (
                <li key={i}>
                  {p.path && <span className="font-mono">{p.path}: </span>}
                  {p.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {outcome?.kind === 'done' && (
        <div role="status" className="space-y-2">
          <p className="text-sm">Uploaded {outcome.synth}&apos;s content.</p>
          <table className="text-sm">
            <thead>
              <tr>
                <th className="pr-4 text-left font-medium" />
                {COLUMNS.map((c) => (
                  <th key={c.key} className="pr-4 text-right font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TABLES.map((t) => (
                <tr key={t.key}>
                  <th className="pr-4 text-left font-normal">{t.label}</th>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="pr-4 text-right tabular-nums">
                      {outcome.report[t.key][c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
