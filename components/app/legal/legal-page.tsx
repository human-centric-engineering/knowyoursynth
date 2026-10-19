import '@/components/app/marketing/faces';

/**
 * The frame the privacy policy and the terms share (`f-front-door` t-64): the About page's look, so the legal pages
 * read as part of the same site. A label, the title, the date it last changed, then the sections.
 */

export const legalLink = 'text-(--kys-accent) underline-offset-4 hover:underline';

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="kys-frame mx-auto w-full max-w-[720px] px-4 py-12 text-(--kys-text) sm:px-6 md:py-16">
      <header className="border-b border-(--kys-line) pb-6">
        <p className="kys-label text-(--kys-accent)">Legal</p>
        <h1 className="kys-display mt-1 text-[28px] leading-tight sm:text-[32px]">{title}</h1>
        <p className="mt-3 text-[14px] text-(--kys-muted)">Last updated {updated}</p>
      </header>
      {children}
    </article>
  );
}

export function LegalSection({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10" id={id}>
      <h2 className="kys-display text-[20px] leading-tight sm:text-[22px]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-(--kys-muted) [&_li]:mt-1.5 [&_strong]:text-(--kys-text) [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
