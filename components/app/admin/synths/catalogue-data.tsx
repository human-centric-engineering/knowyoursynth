'use client';

/**
 * CatalogueData — the catalogue against the seed, and the content template (`f-catalogue-admin`, t-32).
 *
 * Renders `GET /api/v1/admin/synths/data`: one collapsible group per synth, then the limits shared by every panel,
 * each row marked by how it stands against what the seed last planned. Rows that match are hidden until asked for, so
 * what an admin sees first is what has moved. A row that differs shows each column that does, the seed's value beside
 * the stored one.
 *
 * The downloads fetch `GET /api/v1/admin/synths/data/schema` and `GET /api/v1/admin/synths/data/[id]/template` and
 * save the result as a file. The only write is the content upload (`CatalogueUpload`, t-33).
 */

import { useState } from 'react';
import { Download } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CatalogueUpload } from '@/components/app/admin/synths/catalogue-upload';
import { apiClient } from '@/lib/api/client';
import type {
  CatalogueReconciliation,
  ReconciledGroup,
  ReconciledRow,
  RowStatus,
} from '@/lib/app/catalogue/reconcile';
import type { SynthContentTemplate } from '@/lib/app/catalogue/template';

export const STATUS_LABEL: Record<RowStatus, string> = {
  matches: 'Matches the seed',
  differs: 'Not seeded yet',
  edited: 'Edited',
  'edited-matches': 'Edited, same as the seed',
  'not-in-seed': 'Not in the seed',
  'not-in-tables': 'Seed only',
};

const STATUS_VARIANT: Record<RowStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  matches: 'outline',
  differs: 'destructive',
  edited: 'default',
  'edited-matches': 'secondary',
  'not-in-seed': 'secondary',
  'not-in-tables': 'destructive',
};

const STATUS_ORDER: RowStatus[] = [
  'edited',
  'differs',
  'not-in-tables',
  'not-in-seed',
  'edited-matches',
  'matches',
];

function saveJson(value: unknown, filename: string): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** A button that fetches a JSON document and saves it, saying so in place when it fails. */
function DownloadButton({
  label,
  fetchValue,
  filename,
}: {
  label: string;
  fetchValue: () => Promise<{ value: unknown; note?: string }>;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { value, note } = await fetchValue();
      saveJson(value, filename);
      if (note) setMessage({ text: note, error: false });
    } catch {
      setMessage({ text: 'Could not download it. Try again.', error: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run()}>
        <Download className="mr-1.5 h-4 w-4" aria-hidden />
        {busy ? 'Downloading…' : label}
      </Button>
      {message && (
        <span
          role={message.error ? 'alert' : 'status'}
          className={message.error ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}
        >
          {message.text}
        </span>
      )}
    </span>
  );
}

const showValue = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2);

function RowDetail({ row }: { row: ReconciledRow }) {
  if (!row.differences.length) return null;
  return (
    <details className="mt-1">
      <summary className="text-muted-foreground cursor-pointer text-xs">
        Differs in {row.differences.map((d) => d.field).join(', ')}
      </summary>
      <dl className="mt-2 space-y-3">
        {row.differences.map((d) => (
          <div key={d.field}>
            <dt className="font-mono text-xs font-medium">{d.field}</dt>
            <dd className="mt-1 grid gap-2 md:grid-cols-2">
              <div>
                <div className="text-muted-foreground text-xs">The seed</div>
                <pre className="bg-muted max-h-48 overflow-auto rounded p-2 text-xs whitespace-pre-wrap">
                  {showValue(d.seed)}
                </pre>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Stored</div>
                <pre className="bg-muted max-h-48 overflow-auto rounded p-2 text-xs whitespace-pre-wrap">
                  {showValue(d.current)}
                </pre>
              </div>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function Group({ group, showMatching }: { group: ReconciledGroup; showMatching: boolean }) {
  const rows = showMatching ? group.rows : group.rows.filter((r) => r.status !== 'matches');
  const moved = group.rows.length - group.counts.matches;
  return (
    <details
      className="rounded-md border"
      data-testid={`catalogue-data-${group.synthId ?? 'shared'}`}
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3">
        <span className="font-medium">{group.name}</span>
        {STATUS_ORDER.filter((s) => group.counts[s] > 0).map((s) => (
          <Badge key={s} variant={STATUS_VARIANT[s]}>
            {group.counts[s]} · {STATUS_LABEL[s]}
          </Badge>
        ))}
      </summary>
      <div className="space-y-3 border-t px-4 py-3">
        {group.synthId !== null && (
          <DownloadButton
            label="Download content"
            filename={`${group.synthId}.content.json`}
            fetchValue={async () => {
              const id = group.synthId ?? '';
              const template = await apiClient.get<SynthContentTemplate>(
                `/api/v1/admin/synths/data/${encodeURIComponent(id)}/template`
              );
              return {
                value: template.content,
                note: template.problems.length
                  ? `Saved, but ${template.problems.length} part(s) do not fit the schema: ${template.problems
                      .slice(0, 3)
                      .map((p) => `${p.path} (${p.message})`)
                      .join('; ')}`
                  : undefined,
              };
            }}
          />
        )}
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {moved === 0
              ? 'Every row matches the seed.'
              : 'Nothing to show with the matching rows hidden.'}
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={`${row.table}:${row.key}`} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">{row.label}</span>
                  <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                  {row.editedAt && (
                    <span className="text-muted-foreground text-xs">
                      edited {row.editedAt.slice(0, 10)}
                    </span>
                  )}
                </div>
                <RowDetail row={row} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export interface CatalogueDataProps {
  data: CatalogueReconciliation;
}

export function CatalogueData({ data }: CatalogueDataProps) {
  const [showMatching, setShowMatching] = useState(false);
  const totals = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, data.groups.reduce((n, g) => n + g.counts[s], 0)])
  ) as Record<RowStatus, number>;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Template{' '}
          <FieldHelp title="The content template">
            <p>
              One synth&apos;s content (its sounds, history and notes) is a single JSON object. The
              schema describes every field of it. Point an editor at the schema to check a file as
              you write it.
            </p>
            <p className="mt-2">
              To start from what a synth has now, open it below and download its content. It comes
              from the tables, so it includes any admin edits.
            </p>
          </FieldHelp>
        </h2>
        <DownloadButton
          label="Download the schema"
          filename="synth-content.schema.json"
          fetchValue={async () => ({
            value: await apiClient.get<unknown>('/api/v1/admin/synths/data/schema'),
          })}
        />
      </section>

      <CatalogueUpload
        synths={data.groups.flatMap((g) =>
          // Only synths the tables have: one the seed planned but has not written yet cannot take content.
          g.synthId && g.rows.some((r) => r.table === 'SYNTH' && r.status !== 'not-in-tables')
            ? [{ id: g.synthId, name: g.name }]
            : []
        )}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Against the seed{' '}
          <FieldHelp title="How rows are compared">
            <ul className="list-disc space-y-1 pl-4">
              <li>
                <strong>{STATUS_LABEL.matches}</strong>: nobody has edited it, and it holds what the
                seed planned.
              </li>
              <li>
                <strong>{STATUS_LABEL.edited}</strong>: an admin changed it and the seed now has
                something different. The seed will not overwrite it.
              </li>
              <li>
                <strong>{STATUS_LABEL['edited-matches']}</strong>: an admin changed it, but it holds
                what the seed has anyway.
              </li>
              <li>
                <strong>{STATUS_LABEL.differs}</strong>: nobody has edited it, but it does not hold
                what the seed planned. The next seed run brings it in.
              </li>
              <li>
                <strong>{STATUS_LABEL['not-in-seed']}</strong>: an admin added it, or the seed data
                no longer has it.
              </li>
              <li>
                <strong>{STATUS_LABEL['not-in-tables']}</strong>: the seed planned it and the tables
                do not have it yet.
              </li>
            </ul>
            <p className="mt-2">Order and listing are placement, not content, and never count.</p>
          </FieldHelp>
        </h2>
        {!data.recorded ? (
          <p role="status" className="text-sm">
            The seed has not recorded anything yet. Once it has run, every row is compared here.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {STATUS_ORDER.filter((s) => totals[s] > 0)
                .map((s) => `${totals[s]} ${STATUS_LABEL[s].toLowerCase()}`)
                .join(' · ')}
              {data.lastRecordedAt &&
                ` · the seed last recorded a change on ${data.lastRecordedAt.slice(0, 10)}`}
            </p>
            <div className="flex items-center gap-2">
              <Switch
                id="catalogue-data-show-matching"
                checked={showMatching}
                onCheckedChange={setShowMatching}
              />
              <Label htmlFor="catalogue-data-show-matching">Show rows that match the seed</Label>
            </div>
            <div className="space-y-2">
              {data.groups.map((group) => (
                <Group key={group.synthId ?? 'shared'} group={group} showMatching={showMatching} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
