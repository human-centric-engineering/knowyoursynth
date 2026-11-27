import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';

import { synthAboutHref } from '@/components/app/synth/routes';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Asked to be modelled · Catalogue',
  description: 'The synths visitors have asked to be modelled, the most asked first.',
};

const TallySchema = z.array(
  z.object({
    instrument: z.object({
      id: z.string(),
      name: z.string(),
      maker: z.string(),
      year: z.string(),
      kind: z.string(),
    }),
    count: z.number(),
    lastAskedAt: z.string(),
  })
);
type Tally = z.infer<typeof TallySchema>;

/** The tally through the admin API an API client reads, or null when it could not be loaded. */
async function load(): Promise<Tally | null> {
  try {
    const res = await serverFetch('/api/v1/admin/synths/model-requests');
    if (!res.ok) return null;
    const body = await parseApiResponse<unknown>(res);
    if (!body.success) return null;
    const parsed = TallySchema.safeParse(body.data);
    return parsed.success ? parsed.data : null;
  } catch (err) {
    logger.error('model requests admin: fetch failed', err);
    return null;
  }
}

/**
 * Admin: the synths visitors have asked to be modelled (`f-synth-picker` t-330), a thin server shell over
 * `GET /api/v1/admin/synths/model-requests`. It names nobody; a failed fetch says so in place of the list.
 */
export default async function ModelRequestsPage() {
  const tally = await load();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/admin/synths/catalogue"
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Catalogue
        </Link>
        <h1 className="text-2xl font-semibold">
          Asked to be modelled{' '}
          <FieldHelp title="Asked to be modelled">
            <p>
              Signed-in visitors ask from the page about a synth nobody has modelled, which the
              synth picker opens with &ldquo;All synths ever made&rdquo;. Each visitor counts once
              per synth, and can withdraw. This list names nobody.
            </p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground text-sm">The most asked first.</p>
      </header>

      {tally === null ? (
        <p role="alert" className="text-destructive text-sm">
          The requests could not be loaded. Reload the page to try again.
        </p>
      ) : tally.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nobody has asked for a synth yet.</p>
      ) : (
        <table className="w-full max-w-3xl text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="py-2 font-medium">Synth</th>
              <th className="py-2 font-medium">Kind</th>
              <th className="py-2 text-right font-medium">Asked</th>
              <th className="py-2 text-right font-medium">Last asked</th>
            </tr>
          </thead>
          <tbody>
            {tally.map((t) => (
              <tr key={t.instrument.id} className="border-b">
                <td className="py-2">
                  <Link href={synthAboutHref(t.instrument.id)} className="hover:underline">
                    {t.instrument.maker} {t.instrument.name}
                  </Link>{' '}
                  <span className="text-muted-foreground">{t.instrument.year}</span>
                </td>
                <td className="py-2">{t.instrument.kind}</td>
                <td className="py-2 text-right tabular-nums">{t.count}</td>
                <td className="py-2 text-right tabular-nums">{t.lastAskedAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
