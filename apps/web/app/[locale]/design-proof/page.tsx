import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { DesignProofView, type ProofView } from "@/components/app/signature/design-proof-views";
import { WorldSequence } from "@/components/app/spatial/world-sequence";
import { AvatarGallery } from "@/components/app/system/avatar-gallery";
import { StressTest } from "@/components/app/system/stress-test";
import { HomeProof, type HomeProofState } from "@/components/app/system/home-proof";
import { IdentitySizesProof } from "@/components/app/system/identity-sizes-proof";
import { ProductProof, type ProofScreen } from "@/components/app/system/product-proof";
import type { ActiveLocale } from "@/lib/i18n/config";

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

const VIEWS: readonly (ProofView | "world" | "avatars" | "product" | "stress")[] = ["product", "stress", "avatars", "world", "identity", "record", "match"];

export default async function DesignProofPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ state?: string; ptab?: string; dash?: string; v?: string; p?: string; autoplay?: string; s?: string; team?: string; cv?: string; profile?: string; open?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { locale } = await params;
  setRequestLocale(locale);
  const { ptab, dash, v, p, autoplay, s, team, cv, profile, open, state } = await searchParams;
  const view = (VIEWS as readonly string[]).includes(v ?? "") ? (v as ProofView | "world" | "avatars" | "product" | "stress") : "product";
  const fixedP = p !== undefined && Number.isFinite(Number(p)) ? Math.min(1, Math.max(0, Number(p))) : undefined;

  if (v === "identity-sizes") {
    return (
      <main className="min-h-screen bg-ink-900 text-text-primary" data-testid="design-proof">
        <IdentitySizesProof />
      </main>
    );
  }

  if (v === "home") {
    const homeState = (["rich", "light", "unknown", "partial"] as const).find((x) => x === state) ?? "rich";
    return (
      <main className="min-h-screen bg-ink-900" data-testid="design-proof">
        <HomeProof state={homeState satisfies HomeProofState} locale={locale as ActiveLocale} />
      </main>
    );
  }

  if (view === "product") {
    return (
      <main className="min-h-screen bg-ink-900" data-testid="design-proof">
        <ProductProof
          initial={(s as ProofScreen | undefined) ?? "dashboard"}
          dash={(dash as never) ?? "active"}
          initialTeam={team === "full" ? "full" : "start"}
          cv={cv ?? "tk"}
          profile={profile ?? "is"}
          chatOpen={open === "1"}
          ptab={(ptab as never) ?? "overview"}
        />
      </main>
    );
  }

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
      {view === "stress" ? <StressTest /> : view === "avatars" ? <AvatarGallery /> : view === "world" ? <WorldSequence fixedP={fixedP} autoplay={autoplay !== "0"} /> : <DesignProofView view={view} />}
    </main>
  );
}
