import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";

/**
 * Evidence Status Strip (v1). A small, honest legend that shows — visually —
 * the three states a piece of evidence can be in, and which of them currently
 * apply to what the worker is looking at. No score, no fake verification, no
 * automatic confirmation.
 *
 * The three states map straight to real stored data (the caller decides which
 * are `active`, never this component):
 *   - self_declared        → the worker's own record (always the baseline).
 *   - awaiting_confirmation → submitted, waiting for a SUPPORTED confirmer
 *     (manager / owner / external (client) manager) to confirm it.
 *   - confirmed            → a real approved confirmation row exists. The
 *     caller passes "confirmed" ONLY when the data actually supports it, so
 *     this chip never lights up without a real confirmation signal.
 *
 * Non-active states render muted, so the difference between "my own record"
 * and "confirmed" is always visible. Compact chips, wrap-safe on mobile.
 */

export type EvidenceStatus =
  | "self_declared"
  | "awaiting_confirmation"
  | "confirmed";

const ORDER: readonly EvidenceStatus[] = [
  "self_declared",
  "awaiting_confirmation",
  "confirmed",
] as const;

const ACTIVE_STYLE: Record<EvidenceStatus, { chip: string; dot: string }> = {
  self_declared: {
    chip: "border-border bg-surface-muted text-text-secondary",
    dot: "bg-text-muted",
  },
  awaiting_confirmation: {
    chip: "border-state-warning/40 bg-state-warning/10 text-state-warning",
    dot: "bg-state-warning",
  },
  // Silent-trust rule: the strongest state carries a NEUTRAL tone, not a green
  // "verified" chip — it is a private signal, never a public certification.
  confirmed: {
    chip: "border-ink-500 bg-ink-800 text-text-secondary",
    dot: "bg-text-muted",
  },
};

const MUTED_CHIP = "border-border/50 bg-transparent text-text-muted";

export async function EvidenceStatusStrip({
  active,
  className,
  "data-testid": testId = "evidence-status-strip",
}: {
  /** The states that currently apply. Pass "confirmed" only when a real
   *  confirmation exists — the component never infers it. */
  active: readonly EvidenceStatus[];
  className?: string;
  "data-testid"?: string;
}) {
  const t = await getTranslations("evidenceStatus");
  const activeSet = new Set(active);

  return (
    <ul
      className={`m-0 flex list-none flex-wrap items-center gap-1.5 p-0 ${className ?? ""}`}
      data-testid={testId}
      aria-label={t("aria")}
    >
      {ORDER.map((status) => {
        const isActive = activeSet.has(status);
        const chip = (
          <span
            data-status={status}
            data-active={isActive}
            title={t(`${status}.hint`)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-meta leading-tight ${
              isActive ? ACTIVE_STYLE[status].chip : MUTED_CHIP
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                isActive ? ACTIVE_STYLE[status].dot : "bg-text-muted/40"
              }`}
            />
            {t(`${status}.label`)}
          </span>
        );
        // Dead-UI rule F (owner smoke 2026-07-05): an ACTIVE "waiting"
        // chip must lead to the explanation of WHO reviews and HOW — the
        // Evidence Report prints exactly that ladder.
        if (status === "awaiting_confirmation" && isActive) {
          return (
            <li key={status}>
              <Link
                href="/dashboard/reports/evidence"
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                data-testid="evidence-awaiting-review-link"
              >
                {chip}
              </Link>
            </li>
          );
        }
        return <li key={status}>{chip}</li>;
      })}
    </ul>
  );
}
