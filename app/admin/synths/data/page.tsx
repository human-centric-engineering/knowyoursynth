import type { Metadata } from 'next';

import { CatalogueData } from '@/components/app/admin/synths/catalogue-data';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { CatalogueReconciliation } from '@/lib/app/catalogue/reconcile';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Catalogue data',
  description:
    'Where the catalogue’s content comes from, which rows still match the seed, a template for new content, and its upload.',
};

/**
 * Admin — Data (`f-catalogue-admin`, t-32).
 *
 * A thin server shell over `GET /api/v1/admin/synths/data`, the comparison an API client reads. The explanation of the
 * data path is static. A failed fetch says so in place of the comparison rather than throwing.
 */
async function getReconciliation(): Promise<CatalogueReconciliation | null> {
  try {
    const res = await serverFetch('/api/v1/admin/synths/data');
    if (!res.ok) return null;
    const body = await parseApiResponse<CatalogueReconciliation>(res);
    return body.success ? body.data : null;
  } catch (err) {
    logger.error('catalogue data page: fetch failed', err);
    return null;
  }
}

const PATH = [
  {
    title: 'Seed data',
    text: 'JSON files in the repository, one set per synth: its sounds, history and notes. They change only through a deploy.',
  },
  {
    title: 'The seed',
    text: 'A deploy step (npm run db:seed) that does work only when the data or the code it depends on has changed. It checks every sound against its synth, then creates missing rows and updates ones nobody has edited. It never overwrites an admin’s edit and never deletes. It also records what it planned for every row, which is what this page compares against.',
  },
  {
    title: 'The tables',
    text: 'The source of truth once seeded. Admins edit them in the Catalogue pages or upload a synth’s content below; either is the admin’s from then on.',
  },
  {
    title: 'One read layer',
    text: 'Everything that shows the catalogue reads the tables through the same code, and leaves out any sound that no longer fits its synth.',
  },
  {
    title: 'The API and the pages',
    text: 'The public catalogue and synth pages, and /api/v1, all serve what that layer returns.',
  },
];

export default async function CatalogueDataPage() {
  const data = await getReconciliation();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Data{' '}
          <FieldHelp title="Catalogue data">
            <p>
              Where the catalogue&apos;s content comes from, how each row stands against the seed,
              and a template for preparing new content.
            </p>
            <p className="mt-2">
              The only change made here is a content upload, which adds to one synth&apos;s content
              and never overwrites an admin&apos;s edit.
            </p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground text-sm">
          Which content is still the seed&apos;s, and which an admin has made their own.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">How content reaches the app</h2>
        <ol className="grid gap-2 md:grid-cols-5">
          {PATH.map((step, i) => (
            <li key={step.title} className="rounded-md border p-3">
              <div className="text-muted-foreground text-xs">Step {i + 1}</div>
              <div className="font-medium">{step.title}</div>
              <p className="text-muted-foreground mt-1 text-xs">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {data === null ? (
        <p role="alert" className="text-destructive text-sm">
          The comparison could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <CatalogueData data={data} />
      )}
    </div>
  );
}
