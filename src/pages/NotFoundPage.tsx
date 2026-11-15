import { Section } from '@/components/ornaments';
import { shopHref } from '@/lib/router';

/** Shown for any address that does not exist (so Google never indexes a wrong address as the home page). */
export function NotFoundPage() {
  return (
    <Section className="py-20 text-center">
      <p className="font-display text-sm tracking-[0.2em] text-gold-500">ERROR 404</p>
      <h1 className="mt-3 font-display text-3xl text-onyx-300 sm:text-4xl">This page could not be found</h1>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-7 text-ink/75">The link may be old or mistyped. You can go back to the home page or browse the collection.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a href="/" className="inline-flex min-h-12 items-center rounded bg-onyx-300 px-6 font-display text-xs tracking-[0.1em] text-gold-100">HOME</a>
        <a href={shopHref()} className="inline-flex min-h-12 items-center rounded border border-onyx-300 px-6 font-display text-xs tracking-[0.1em] text-onyx-300">SHOP THE COLLECTION</a>
      </div>
    </Section>
  );
}
