import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { listAttentionInstructions } from "@/lib/instructions/instructions";

/**
 * "Reikia jūsų dėmesio" — surfaces REAL new (unread) work instructions inside
 * "Kas dabar svarbu / Mano pranešimai" (slice instructions-attention-v2), so an
 * urgent instruction is not hidden on a separate page.
 *
 * Honest by construction: it renders ONLY genuinely-unread instructions
 * addressed to the user. When there are none it renders NOTHING (the page keeps
 * its calm empty state) — never a fake count, fake urgency, or fake "someone
 * needs you". The snippet is the ORIGINAL text (translation not ready yet); the
 * full instruction + original + clarification live on /dashboard/instructions.
 */
export async function AttentionInstructions() {
  const items = await listAttentionInstructions();
  if (items.length === 0) return null;

  const t = await getTranslations("instructions.attention");

  return (
    <section
      className="card-border flex flex-col gap-3 border-brand-orange/30 bg-brand-orange/5 p-4"
      data-testid="attention-instructions"
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-meta uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </span>
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">
          {t("subtitle")}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {items.slice(0, 5).map((ins) => {
          const snippet =
            ins.originalText.length > 120
              ? `${ins.originalText.slice(0, 120)}…`
              : ins.originalText;
          return (
            <li
              key={ins.id}
              className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/40 p-3"
              data-testid="attention-instruction-item"
            >
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("from", { name: ins.authorName ?? "—" })}
              </span>
              <p className="text-sm leading-snug text-text-primary">{snippet}</p>
              <Link
                href="/dashboard/instructions"
                className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md border border-brand-blue/40 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10"
                data-testid="attention-instruction-view"
              >
                {t("viewCta")} →
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
