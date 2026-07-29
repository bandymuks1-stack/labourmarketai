import { getTranslations } from "next-intl/server";

import { getMyDiscoverabilityState } from "@/lib/privacy/discoverability-actions";
import { Link } from "@/lib/i18n/navigation";

/**
 * Worker-dashboard privacy status card (consent-and-disclosure v1).
 *
 * Always-visible, NEVER blocking: shows the CURRENT employer-visibility
 * state and links to the canonical privacy screen. Calm neutral styling —
 * no red scare block, no "privaloma", no modal, no gate in front of the
 * private profile/CV/journal. Renders nothing only when the state cannot
 * be read at all (pre-migration or signed-out edge).
 */
export async function PrivacyStatusCard() {
  const t = await getTranslations("privacyConsent");
  const state = await getMyDiscoverabilityState();
  if (state.kind !== "ok" && state.kind !== "needs-migration") return null;

  const status = state.kind === "needs-migration" ? "not_set" : state.status;

  const title =
    status === "granted"
      ? t("status.visible")
      : status === "withdrawn"
        ? t("status.withdrawn")
        : t("status.hidden");
  const body = status === "granted" ? t("status.visibleBody") : t("status.hiddenBody");
  const cta = status === "granted" ? t("actions.manage") : t("actions.review");

  return (
    <section
      className="card-border flex flex-col gap-2 p-5"
      data-testid="privacy-status-card"
      data-privacy-status={status}
    >
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">
        {t("sections.visibility")}
      </p>
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="text-sm leading-relaxed text-text-secondary">{body}</p>
      <Link
        href="/dashboard/privacy"
        className="mt-1 inline-flex min-h-11 w-fit items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary transition-colors hover:border-brand-blue"
        data-testid="privacy-status-cta"
      >
        {cta}
      </Link>
    </section>
  );
}
