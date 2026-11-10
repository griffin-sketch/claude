import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

export const LEGAL = {
  company: "KGB Marketing LLC",
  product: "Tourvo",
  site: "www.gettourvo.com",
  email: "info@gettourvo.com",
  updated: "November 10, 2026",
};

/** Plain, readable frame for the privacy policy and terms of service. */
export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" aria-label="Tourvo home">
            <Logo size={28} />
          </Link>
          <nav className="flex gap-4 text-sm font-medium text-ink-soft">
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <p className="eyebrow">Last updated {LEGAL.updated}</p>
        <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">{title}</h1>
        <div className="mt-5 text-[17px] leading-relaxed text-ink-soft">{intro}</div>
        <div className="legal mt-10 space-y-10">{children}</div>
        <p className="mt-14 border-t border-line pt-6 text-sm text-muted">
          Questions? Email <a className="underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
        </p>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-ink-soft">
          <span>© {new Date().getFullYear()} {LEGAL.product} · {LEGAL.company} · Texas</span>
          <Link href="/" className="hover:text-ink">Home</Link>
        </div>
      </footer>
    </div>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="font-display text-2xl text-ink sm:text-[28px]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15.5px] leading-relaxed text-ink-soft [&_a]:underline [&_li]:pl-1 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
