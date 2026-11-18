import { getTranslations } from "next-intl/server";
import { ScrollText } from "lucide-react";

import { guidanceByCountry } from "@/lib/documents/lt-master-guidance";

/**
 * Lithuanian-master document guidance surface (CR train WAGON 9, area 17).
 *
 * OWNER RULE (2026-07-05): the guidance content exists in Lithuanian ONLY.
 * Rendering is therefore locale-split at this component:
 *   - lt  → the guidance registry, grouped by work country, with the intro
 *           ("informacinio pobūdžio") and one line pointing to official
 *           sources;
 *   - any other locale → ONLY the short "available in Lithuanian only"
 *           notice — never a translated body.
 *
 * Owner P0 (2026-10-23): the page presents the guidance as information and
 * says nothing about how it was drafted. Pipeline status, owner / lawyer
 * review state and "draft" labels are internal registry data
 * (lib/documents/lt-master-guidance.ts keeps `status` and
 * `needsLegalReview`) and are rendered to nobody.
 * Help-request CTAs are OUT of scope here (WAGON 10): the closing line is
 * information-only and promises nothing interactive.
 */

export async function LtDocumentGuidance({ locale }: { locale: string }) {
  const t = await getTranslations("documents.guidance");

  if (locale !== "lt") {
    // Non-LT locales: short notice ONLY — no guidance bodies exist in any
    // other language (owner correction 2026-07-05).
    return (
      <section
        className="flex flex-col gap-2"
        id="guidance"
        data-testid="documents-guidance"
      >
        <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
          <ScrollText className="h-4 w-4 text-text-muted" aria-hidden />
          {t("title")}
        </h2>
        <p
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="documents-guidance-pending"
        >
          {t("pendingNotice")}
        </p>
      </section>
    );
  }

  const grouped = guidanceByCountry();

  return (
    <section
      className="flex flex-col gap-4"
      id="guidance"
      data-testid="documents-guidance"
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
          <ScrollText className="h-4 w-4 text-text-muted" aria-hidden />
          {t("title")}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">
          {t("intro")}
        </p>
        {/* One factual line: requirements are checked at the official
            source. Nothing about drafting or review state. */}
        <p
          className="text-xs leading-relaxed text-text-secondary"
          data-testid="documents-guidance-disclaimer"
        >
          {t("officialSources")}
        </p>
      </div>

      {/* Density pass (worker-workspace UX audit v2): the full registry made
          the documents page end in a very long always-open list. Each country
          group is now a collapsed disclosure (heading + item count visible);
          every item stays reachable in one tap, nothing is removed. */}
      {[...grouped.entries()].map(([country, items]) => (
        <details key={country} className="group flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/20">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-mono text-meta uppercase tracking-label text-text-muted hover:text-text-primary [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
            {country === "ALL" ? t("groupAll") : country}
            <span className="rounded-full border border-ink-500 px-1.5 py-0.5 tabular-nums">
              {items.length}
            </span>
          </summary>
          <ul className="flex flex-col gap-2 px-3 pb-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="card-border flex flex-col gap-2 p-4"
                data-testid={`guidance-item-${item.id}`}
              >
                <span className="text-sm font-semibold text-text-primary">
                  {item.titleLt}
                </span>
                <p className="text-xs leading-relaxed text-text-secondary">
                  {item.bodyLt}
                </p>
                <p className="text-meta leading-relaxed text-text-muted">
                  {t("whoProvides")}: {item.whoUsuallyProvidesLt}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {item.dependsOn.map((d) => (
                    <span
                      key={d}
                      className="rounded-sm border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted"
                    >
                      {t(`dimensions.${d}` as never)}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ))}

      {/* Information-only closing line — the real help-request flow is a
          WAGON 10 deliverable; nothing here pretends to be a CTA. */}
      <p
        className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-meta leading-relaxed text-text-muted"
        data-testid="documents-guidance-help-info"
      >
        {t("helpInfoNote")}
      </p>
    </section>
  );
}
