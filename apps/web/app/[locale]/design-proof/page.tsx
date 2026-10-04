import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { DesignProofView, type ProofView } from "@/components/app/signature/design-proof-views";

/**
 * DESIGN PROOF — the three representative compositions of the premium product
 * language, on a labelled sample person. Not a product surface: it exists so
 * the visual direction can be reviewed in a real browser, on real states,
 * before it is propagated. Never served in production, never indexed.
 */
export const metadata: Metadata = {
  title: "Design proof",
  robots: { index: false, follow: false },
};

const VIEWS: readonly ProofView[] = ["identity", "record", "match"];

export default async function DesignProofPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { locale } = await params;
  setRequestLocale(locale);
  const { v } = await searchParams;
  const view: ProofView = (VIEWS as readonly string[]).includes(v ?? "") ? (v as ProofView) : "identity";

  return (
    <main className="min-h-screen bg-ink-900" data-testid="design-proof">
      <nav
        aria-label="Design proof views"
        className="sig-stamp fixed inset-x-0 top-0 z-40 flex gap-6 bg-gradient-to-b from-ink-900/90 to-transparent px-5 py-4 backdrop-blur-[2px] sm:px-8 lg:px-12"
      >
        <span className="text-text-muted">Design proof</span>
        {VIEWS.map((x) => (
          <a
            key={x}
            href={`?v=${x}`}
            aria-current={x === view ? "page" : undefined}
            className={x === view ? "text-brand-blue" : "hover:text-text-primary"}
          >
            {x}
          </a>
        ))}
      </nav>
      <DesignProofView view={view} />
    </main>
  );
}
